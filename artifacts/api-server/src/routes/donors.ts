import {
  CreateDonorBody,
  CreateDonorResponse,
  DeleteDonorParams,
  DeleteDonorQueryParams,
  ImportDonorsBody,
  ImportDonorsResponse,
  ListDonorsResponse,
  UpdateDonorBody,
  UpdateDonorParams,
  UpdateDonorResponse,
} from "@workspace/api-zod";
import {
  db,
  donorsTable,
  partsTable,
  syncTombstonesTable,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";

const router: IRouter = Router();

function serialize(row: typeof donorsTable.$inferSelect) {
  return {
    id: row.id,
    year: row.year,
    make: row.make,
    model: row.model,
    engine: row.engine,
    fuel: row.fuel,
    mileage: row.mileage,
    purchasePrice: Number(row.purchasePrice),
    status: row.status as "active" | "closed",
    location: row.location,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function isTombstoned(id: string) {
  const [row] = await db
    .select({ recordId: syncTombstonesTable.recordId })
    .from(syncTombstonesTable)
    .where(
      and(
        eq(syncTombstonesTable.entity, "donor"),
        eq(syncTombstonesTable.recordId, id),
      ),
    )
    .limit(1);
  return Boolean(row);
}

function sendConflict(
  res: Response,
  message: string,
  current?: unknown,
) {
  res.status(409).json({
    error: message,
    code: "VERSION_CONFLICT",
    ...(current === undefined ? {} : { current }),
  });
}

router.get("/donors", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(donorsTable)
    .orderBy(desc(donorsTable.createdAt));
  res.json(ListDonorsResponse.parse(rows.map(serialize)));
});

router.post("/donors", async (req, res): Promise<void> => {
  const parsed = CreateDonorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Neteisingi donoro duomenys." });
    return;
  }
  const input = parsed.data;
  if (await isTombstoned(input.id)) {
    sendConflict(res, "Šis donoro ID jau buvo pašalintas ir negali būti prikeltas.");
    return;
  }
  const [created] = await db
    .insert(donorsTable)
    .values({
      ...input,
      status: input.status ?? "active",
      purchasePrice: input.purchasePrice.toFixed(2),
      createdAt: input.createdAt,
      version: 1,
    })
    .onConflictDoNothing({ target: donorsTable.id })
    .returning();
  if (!created) {
    sendConflict(res, "Šis donoro ID jau naudojamas kitame įraše.");
    return;
  }
  res.status(201).json(CreateDonorResponse.parse(serialize(created)));
});

router.post("/donors/import", async (req, res): Promise<void> => {
  const parsed = ImportDonorsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Nepavyko importuoti donorų." });
    return;
  }
  for (const input of parsed.data.donors) {
    if (await isTombstoned(input.id)) continue;
    await db
      .insert(donorsTable)
      .values({
        ...input,
        status: input.status ?? "active",
        purchasePrice: input.purchasePrice.toFixed(2),
        createdAt: input.createdAt,
        version: 1,
      })
      .onConflictDoNothing({ target: donorsTable.id });
  }
  const rows = await db
    .select()
    .from(donorsTable)
    .orderBy(desc(donorsTable.createdAt));
  res.json(ImportDonorsResponse.parse(rows.map(serialize)));
});

router.patch("/donors/:donorId", async (req, res): Promise<void> => {
  const params = UpdateDonorParams.safeParse(req.params);
  const parsed = UpdateDonorBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Neteisingi donoro duomenys." });
    return;
  }
  const { expectedVersion, ...input } = parsed.data;
  if (expectedVersion === undefined) {
    res.status(409).json({
      error:
        "Donoro pakeitimui būtina naujausia versija. Įkelkite įrašą iš serverio ir pakartokite pakeitimą.",
      code: "VERSION_REQUIRED",
    });
    return;
  }
  const values: Partial<typeof donorsTable.$inferInsert> = {};
  if (input.year !== undefined) values.year = input.year;
  if (input.make !== undefined) values.make = input.make;
  if (input.model !== undefined) values.model = input.model;
  if (input.engine !== undefined) values.engine = input.engine;
  if (input.fuel !== undefined) values.fuel = input.fuel;
  if (input.mileage !== undefined) values.mileage = input.mileage;
  if (input.purchasePrice !== undefined) values.purchasePrice = input.purchasePrice.toFixed(2);
  if (input.status !== undefined) values.status = input.status;
  if (input.location !== undefined) values.location = input.location;
  if (Object.keys(values).length === 0) {
    res.status(400).json({ error: "Nenurodyti donoro pakeitimai." });
    return;
  }
  (values as unknown as Record<string, unknown>).version = sql`${donorsTable.version} + 1`;
  values.updatedAt = new Date();
  const predicates = [eq(donorsTable.id, params.data.donorId)];
  predicates.push(eq(donorsTable.version, expectedVersion));
  const [updated] = await db
    .update(donorsTable)
    .set(values)
    .where(and(...predicates))
    .returning();
  if (!updated) {
    const [current] = await db
      .select()
      .from(donorsTable)
      .where(eq(donorsTable.id, params.data.donorId))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "Donoras nerastas." });
      return;
    }
    sendConflict(
      res,
      "Donoras buvo pakeistas kitame įrenginyje. Įkelkite naujausią įrašą ir pakartokite pakeitimą.",
      serialize(current),
    );
    return;
  }
  res.json(UpdateDonorResponse.parse(serialize(updated)));
});

router.delete("/donors/:donorId", async (req, res): Promise<void> => {
  const params = DeleteDonorParams.safeParse(req.params);
  const query = DeleteDonorQueryParams.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({ error: "Neteisingas donoro identifikatorius." });
    return;
  }
  const parts = await db
    .select({ id: partsTable.id })
    .from(partsTable)
    .where(eq(partsTable.donorId, params.data.donorId));
  if (parts.length > 0 && query.data.preserveParts !== true) {
    res.status(409).json({
      error:
        "Donoras turi detalių. Patvirtinkite preserveParts=true, kad donoras būtų pašalintas, o detalės liktų matomos kaip našlaitės.",
      code: "DONOR_HAS_PARTS",
      partsCount: parts.length,
    });
    return;
  }
  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(donorsTable)
      .where(eq(donorsTable.id, params.data.donorId))
      .returning({ id: donorsTable.id });
    if (!row) return false;
    await tx
      .insert(syncTombstonesTable)
      .values({ entity: "donor", recordId: row.id })
      .onConflictDoNothing();
    return true;
  });
  if (!deleted) {
    res.status(404).json({ error: "Donoras nerastas." });
    return;
  }
  res.sendStatus(204);
});

export default router;