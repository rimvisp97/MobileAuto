import {
  CreateVehicleBody,
  CreateVehicleExpenseBody,
  CreateVehicleExpenseParams,
  CreateVehicleExpenseResponse,
  CreateVehicleResponse,
  DeleteVehicleExpenseParams,
  DeleteVehicleParams,
  ImportVehiclesBody,
  ImportVehiclesResponse,
  ListVehiclesResponse,
  UpdateVehicleBody,
  UpdateVehicleExpenseBody,
  UpdateVehicleExpenseParams,
  UpdateVehicleExpenseResponse,
  UpdateVehicleParams,
  UpdateVehicleResponse,
} from "@workspace/api-zod";
import {
  db,
  syncTombstonesTable,
  vehicleExpensesTable,
  vehiclesTable,
} from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Response } from "express";

const router: IRouter = Router();

function numeric(value: string | number | null | undefined) {
  return value === null || value === undefined ? null : Number(value);
}

function serializeExpense(row: typeof vehicleExpensesTable.$inferSelect) {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    label: row.label,
    amount: Number(row.amount),
    date: row.date,
    category: row.category,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeVehicle(
  row: typeof vehiclesTable.$inferSelect,
  expenses: typeof vehicleExpensesTable.$inferSelect[] = [],
) {
  return {
    id: row.id,
    year: row.year,
    make: row.make,
    model: row.model,
    engine: row.engine,
    fuel: row.fuel,
    mileage: row.mileage,
    purchasePrice: Number(row.purchasePrice),
    status: row.status as "active" | "sold",
    salePrice: numeric(row.salePrice),
    askingPrice: numeric(row.askingPrice),
    purchaseDate: row.purchaseDate,
    vin: row.vin,
    registration: row.registration,
    location: row.location,
    source: row.source,
    notes: row.notes,
    soldAt: row.soldAt,
    expenses: expenses.map(serializeExpense),
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function listSerializedVehicles() {
  const rows = await db
    .select()
    .from(vehiclesTable)
    .orderBy(desc(vehiclesTable.createdAt));
  const expenses = rows.length
    ? await db
        .select()
        .from(vehicleExpensesTable)
        .where(inArray(vehicleExpensesTable.vehicleId, rows.map((row) => row.id)))
        .orderBy(desc(vehicleExpensesTable.date))
    : [];
  const byVehicle = new Map<string, typeof expenses>();
  for (const expense of expenses) {
    const current = byVehicle.get(expense.vehicleId) ?? [];
    current.push(expense);
    byVehicle.set(expense.vehicleId, current);
  }
  return rows.map((row) => serializeVehicle(row, byVehicle.get(row.id) ?? []));
}

function conflict(res: Response, message: string, current?: unknown) {
  res.status(409).json({
    error: message,
    code: "VERSION_CONFLICT",
    ...(current === undefined ? {} : { current }),
  });
}

async function isTombstoned(
  entity: "vehicle" | "expense",
  recordId: string,
) {
  const [row] = await db
    .select({ recordId: syncTombstonesTable.recordId })
    .from(syncTombstonesTable)
    .where(
      and(
        eq(syncTombstonesTable.entity, entity),
        eq(syncTombstonesTable.recordId, recordId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

router.get("/vehicles", async (_req, res): Promise<void> => {
  res.json(ListVehiclesResponse.parse(await listSerializedVehicles()));
});

router.post("/vehicles", async (req, res): Promise<void> => {
  const parsed = CreateVehicleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Neteisingi automobilio duomenys." });
    return;
  }
  const input = parsed.data;
  if (await isTombstoned("vehicle", input.id)) {
    conflict(res, "Šis automobilio ID jau buvo pašalintas ir negali būti prikeltas.");
    return;
  }
  const { expenses, ...fields } = input;
  const [created] = await db
    .insert(vehiclesTable)
    .values({
      ...fields,
      status: fields.status ?? "active",
      purchasePrice: fields.purchasePrice.toFixed(2),
      salePrice:
        fields.salePrice === undefined ? null : fields.salePrice.toFixed(2),
      askingPrice:
        fields.askingPrice === undefined
          ? null
          : fields.askingPrice.toFixed(2),
      version: 1,
    })
    .onConflictDoNothing({ target: vehiclesTable.id })
    .returning();
  if (!created) {
    conflict(res, "Šis automobilio ID jau naudojamas kitame įraše.");
    return;
  }
  if (expenses?.length) {
    const expenseValues = [];
    for (const expense of expenses) {
      const expenseId = expense.id ?? randomUUID();
      if (await isTombstoned("expense", expenseId)) continue;
      expenseValues.push({
        id: expenseId,
        vehicleId: created.id,
        label: expense.label,
        amount: expense.amount.toFixed(2),
        date: expense.date,
        category: expense.category,
      });
    }
    if (expenseValues.length > 0) {
      await db
        .insert(vehicleExpensesTable)
        .values(expenseValues)
        .onConflictDoNothing({ target: vehicleExpensesTable.id });
    }
  }
  const currentExpenses = await db
    .select()
    .from(vehicleExpensesTable)
    .where(eq(vehicleExpensesTable.vehicleId, created.id));
  res
    .status(201)
    .json(CreateVehicleResponse.parse(serializeVehicle(created, currentExpenses)));
});

router.post("/vehicles/import", async (req, res): Promise<void> => {
  const parsed = ImportVehiclesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Nepavyko importuoti automobilių." });
    return;
  }
  // Each insert is additive and uses the legacy ID as its conflict key.  A
  // concurrent browser therefore cannot overwrite the server's existing row.
  for (const input of parsed.data.vehicles) {
    if (await isTombstoned("vehicle", input.id)) continue;
    const { expenses, ...fields } = input;
    await db
      .insert(vehiclesTable)
      .values({
        ...fields,
        status: fields.status ?? "active",
        purchasePrice: fields.purchasePrice.toFixed(2),
        salePrice:
          fields.salePrice === undefined ? null : fields.salePrice.toFixed(2),
        askingPrice:
          fields.askingPrice === undefined
            ? null
            : fields.askingPrice.toFixed(2),
        version: 1,
      })
      .onConflictDoNothing({ target: vehiclesTable.id });
    if (expenses?.length) {
      const expenseValues = [];
      for (const expense of expenses) {
        const expenseId = expense.id ?? randomUUID();
        if (await isTombstoned("expense", expenseId)) continue;
        expenseValues.push({
          id: expenseId,
          vehicleId: input.id,
          label: expense.label,
          amount: expense.amount.toFixed(2),
          date: expense.date,
          category: expense.category,
          createdAt: expense.createdAt,
          updatedAt: expense.updatedAt ?? expense.createdAt,
        });
      }
      if (expenseValues.length > 0) {
        await db
          .insert(vehicleExpensesTable)
          .values(expenseValues)
          .onConflictDoNothing({ target: vehicleExpensesTable.id });
      }
    }
  }
  res.json(ImportVehiclesResponse.parse(await listSerializedVehicles()));
});

router.patch("/vehicles/:vehicleId", async (req, res): Promise<void> => {
  const params = UpdateVehicleParams.safeParse(req.params);
  const parsed = UpdateVehicleBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Neteisingi automobilio duomenys." });
    return;
  }
  const { expectedVersion, ...input } = parsed.data;
  if (expectedVersion === undefined) {
    res.status(409).json({
      error:
        "Automobilio pakeitimui būtina naujausia versija. Įkelkite įrašą iš serverio ir pakartokite pakeitimą.",
      code: "VERSION_REQUIRED",
    });
    return;
  }
  const values: Partial<typeof vehiclesTable.$inferInsert> = {};
  if (input.year !== undefined) values.year = input.year;
  if (input.make !== undefined) values.make = input.make;
  if (input.model !== undefined) values.model = input.model;
  if (input.engine !== undefined) values.engine = input.engine;
  if (input.fuel !== undefined) values.fuel = input.fuel;
  if (input.mileage !== undefined) values.mileage = input.mileage;
  if (input.purchasePrice !== undefined) values.purchasePrice = input.purchasePrice.toFixed(2);
  if (input.status !== undefined) values.status = input.status;
  if (input.salePrice !== undefined) values.salePrice = input.salePrice === null ? null : input.salePrice.toFixed(2);
  if (input.askingPrice !== undefined) values.askingPrice = input.askingPrice === null ? null : input.askingPrice.toFixed(2);
  if (input.purchaseDate !== undefined) values.purchaseDate = input.purchaseDate;
  if (input.vin !== undefined) values.vin = input.vin;
  if (input.registration !== undefined) values.registration = input.registration;
  if (input.location !== undefined) values.location = input.location;
  if (input.source !== undefined) values.source = input.source;
  if (input.notes !== undefined) values.notes = input.notes;
  if (input.soldAt !== undefined) values.soldAt = input.soldAt;
  if (Object.keys(values).length === 0) {
    res.status(400).json({ error: "Nenurodyti automobilio pakeitimai." });
    return;
  }
  (values as unknown as Record<string, unknown>).version = sql`${vehiclesTable.version} + 1`;
  values.updatedAt = new Date();
  const predicates = [eq(vehiclesTable.id, params.data.vehicleId)];
  predicates.push(eq(vehiclesTable.version, expectedVersion));
  const [updated] = await db
    .update(vehiclesTable)
    .set(values)
    .where(and(...predicates))
    .returning();
  if (!updated) {
    const [current] = await db
      .select()
      .from(vehiclesTable)
      .where(eq(vehiclesTable.id, params.data.vehicleId))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "Automobilis nerastas." });
      return;
    }
    const currentExpenses = await db
      .select()
      .from(vehicleExpensesTable)
      .where(eq(vehicleExpensesTable.vehicleId, current.id));
    conflict(
      res,
      "Automobilis buvo pakeistas kitame įrenginyje. Įkelkite naujausią įrašą ir pakartokite pakeitimą.",
      serializeVehicle(current, currentExpenses),
    );
    return;
  }
  const currentExpenses = await db
    .select()
    .from(vehicleExpensesTable)
    .where(eq(vehicleExpensesTable.vehicleId, updated.id));
  res.json(UpdateVehicleResponse.parse(serializeVehicle(updated, currentExpenses)));
});

router.delete("/vehicles/:vehicleId", async (req, res): Promise<void> => {
  const params = DeleteVehicleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Neteisingas automobilio identifikatorius." });
    return;
  }
  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(vehiclesTable)
      .where(eq(vehiclesTable.id, params.data.vehicleId))
      .returning({ id: vehiclesTable.id });
    if (!row) return false;
    await tx
      .insert(syncTombstonesTable)
      .values({ entity: "vehicle", recordId: row.id })
      .onConflictDoNothing();
    return true;
  });
  if (!deleted) {
    res.status(404).json({ error: "Automobilis nerastas." });
    return;
  }
  res.sendStatus(204);
});

router.post("/vehicles/:vehicleId/expenses", async (req, res): Promise<void> => {
  const params = CreateVehicleExpenseParams.safeParse(req.params);
  const parsed = CreateVehicleExpenseBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Neteisingi išlaidų duomenys." });
    return;
  }
  const [vehicle] = await db
    .select({ id: vehiclesTable.id })
    .from(vehiclesTable)
    .where(eq(vehiclesTable.id, params.data.vehicleId))
    .limit(1);
  if (!vehicle) {
    res.status(404).json({ error: "Automobilis nerastas." });
    return;
  }
  const expenseId = parsed.data.id ?? randomUUID();
  if (await isTombstoned("expense", expenseId)) {
    conflict(res, "Šios išlaidos jau buvo pašalintos ir negali būti prikeltos.");
    return;
  }
  const [created] = await db
    .insert(vehicleExpensesTable)
    .values({
      id: expenseId,
      vehicleId: vehicle.id,
      label: parsed.data.label,
      amount: parsed.data.amount.toFixed(2),
      date: parsed.data.date,
      category: parsed.data.category,
    })
    .onConflictDoNothing({ target: vehicleExpensesTable.id })
    .returning();
  if (!created) {
    conflict(res, "Šis išlaidų ID jau naudojamas kitame įraše.");
    return;
  }
  res.status(201).json(CreateVehicleExpenseResponse.parse(serializeExpense(created)));
});

router.patch("/expenses/:expenseId", async (req, res): Promise<void> => {
  const params = UpdateVehicleExpenseParams.safeParse(req.params);
  const parsed = UpdateVehicleExpenseBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Neteisingi išlaidų duomenys." });
    return;
  }
  const { expectedVersion, ...input } = parsed.data;
  if (expectedVersion === undefined) {
    res.status(409).json({
      error:
        "Išlaidų pakeitimui būtina naujausia versija. Įkelkite įrašą iš serverio ir pakartokite pakeitimą.",
      code: "VERSION_REQUIRED",
    });
    return;
  }
  const values: Partial<typeof vehicleExpensesTable.$inferInsert> = {};
  if (input.label !== undefined) values.label = input.label;
  if (input.amount !== undefined) values.amount = input.amount.toFixed(2);
  if (input.date !== undefined) values.date = input.date;
  if (input.category !== undefined) values.category = input.category;
  if (Object.keys(values).length === 0) {
    res.status(400).json({ error: "Nenurodyti išlaidų pakeitimai." });
    return;
  }
  (values as unknown as Record<string, unknown>).version = sql`${vehicleExpensesTable.version} + 1`;
  values.updatedAt = new Date();
  const predicates = [eq(vehicleExpensesTable.id, params.data.expenseId)];
  predicates.push(eq(vehicleExpensesTable.version, expectedVersion));
  const [updated] = await db
    .update(vehicleExpensesTable)
    .set(values)
    .where(and(...predicates))
    .returning();
  if (!updated) {
    const [current] = await db
      .select()
      .from(vehicleExpensesTable)
      .where(eq(vehicleExpensesTable.id, params.data.expenseId))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "Išlaidos nerastos." });
      return;
    }
    conflict(res, "Išlaidos buvo pakeistos kitame įrenginyje.", serializeExpense(current));
    return;
  }
  res.json(UpdateVehicleExpenseResponse.parse(serializeExpense(updated)));
});

router.delete("/expenses/:expenseId", async (req, res): Promise<void> => {
  const params = DeleteVehicleExpenseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Neteisingas išlaidų identifikatorius." });
    return;
  }
  const [deleted] = await db
    .delete(vehicleExpensesTable)
    .where(eq(vehicleExpensesTable.id, params.data.expenseId))
    .returning({ id: vehicleExpensesTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Išlaidos nerastos." });
    return;
  }
  await db
    .insert(syncTombstonesTable)
    .values({ entity: "expense", recordId: deleted.id })
    .onConflictDoNothing();
  res.sendStatus(204);
});

export default router;