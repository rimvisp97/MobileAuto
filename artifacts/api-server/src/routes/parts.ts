import { randomBytes } from "node:crypto";
import {
  CreatePartBody,
  CreatePartResponse,
  DeletePartParams,
  GetPublicPartParams,
  GetPublicPartResponse,
  ImportPartsBody,
  ImportPartsResponse,
  ListPartsResponse,
  UpdatePartBody,
  UpdatePartParams,
  UpdatePartResponse,
} from "@workspace/api-zod";
import { db, donorsTable, partsTable, syncTombstonesTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";

const router: IRouter = Router();

function serialize(row: typeof partsTable.$inferSelect) {
  return {
    id: row.id,
    publicId: row.publicId,
    donorId: row.donorId,
    donorLabel: row.donorLabel,
    name: row.name,
    code: row.code,
    price: Number(row.price),
    status: row.status as "inventory" | "sold",
    location: row.location,
    soldAt: row.soldAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

async function isTombstoned(entity: string, recordId: string) {
  const [row] = await db
    .select({ recordId: syncTombstonesTable.recordId })
    .from(syncTombstonesTable)
    .where(and(
      eq(syncTombstonesTable.entity, entity),
      eq(syncTombstonesTable.recordId, recordId),
    ))
    .limit(1);
  return Boolean(row);
}

async function donorExists(donorId: string) {
  const [row] = await db
    .select({ id: donorsTable.id })
    .from(donorsTable)
    .where(eq(donorsTable.id, donorId))
    .limit(1);
  return Boolean(row) && !(await isTombstoned("donor", donorId));
}

router.get("/parts", async (req, res): Promise<void> => {
  const rows = await db.select().from(partsTable).orderBy(desc(partsTable.createdAt));
  res.json(ListPartsResponse.parse(rows.map(serialize)));
});

router.post("/parts", async (req, res): Promise<void> => {
  const body = CreatePartBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Neteisingi detalės duomenys." });
    return;
  }
  if (!(await donorExists(body.data.donorId))) {
    res.status(409).json({ error: "Detalės donoras nerastas serveryje. Pirmiausia išsaugokite donorą." });
    return;
  }

  const [created] = await db
    .insert(partsTable)
    .values({
      ...body.data,
      price: body.data.price.toFixed(2),
      publicId: randomBytes(18).toString("base64url"),
    })
    .returning();
  res.status(201).json(CreatePartResponse.parse(serialize(created)));
});

router.post("/parts/import", async (req, res): Promise<void> => {
  const body = ImportPartsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Nepavyko importuoti esamų detalių." });
    return;
  }

  // The unique legacy ID is the idempotency key.  Do not rely on a
  // select-then-insert check here: two browsers can import the same old
  // localStorage record at the same time.
  if (body.data.parts.length) {
    const validParts = [];
    for (const part of body.data.parts) {
      if (await isTombstoned("part-legacy", part.legacyId)) continue;
      if (!(await donorExists(part.donorId))) continue;
      validParts.push(part);
    }
    if (validParts.length === 0) {
      const rows = await db.select().from(partsTable).orderBy(desc(partsTable.createdAt));
      res.json(ImportPartsResponse.parse(rows.map(serialize)));
      return;
    }
    await db
      .insert(partsTable)
      .values(
        validParts.map((part) => ({
          publicId: randomBytes(18).toString("base64url"),
          legacyId: part.legacyId,
          donorId: part.donorId,
          donorLabel: part.donorLabel,
          name: part.name,
          code: part.code,
          price: part.price.toFixed(2),
          status: part.status,
          location: part.location,
          createdAt: part.createdAt,
          soldAt: part.soldAt ?? null,
        })),
      )
      .onConflictDoNothing({ target: partsTable.legacyId });
  }

  const rows = await db.select().from(partsTable).orderBy(desc(partsTable.createdAt));
  res.json(ImportPartsResponse.parse(rows.map(serialize)));
});

router.patch("/parts/:partId", async (req, res): Promise<void> => {
  const params = UpdatePartParams.safeParse(req.params);
  const body = UpdatePartBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Neteisingi detalės duomenys." });
    return;
  }
  const current = await db
    .select()
    .from(partsTable)
    .where(eq(partsTable.id, params.data.partId))
    .limit(1);
  if (!current[0]) {
    res.status(404).json({ error: "Detalė nerasta." });
    return;
  }
  if (current[0].version !== body.data.expectedVersion) {
    res.status(409).json({
      error: "Detalė buvo pakeista kitame įrenginyje. Įkelkite naujausius duomenis ir pakartokite.",
      code: "VERSION_CONFLICT",
      current: serialize(current[0]),
    });
    return;
  }

  const values: Partial<typeof partsTable.$inferInsert> = {};
  if (body.data.name !== undefined) values.name = body.data.name;
  if (body.data.code !== undefined) values.code = body.data.code;
  if (body.data.price !== undefined) values.price = body.data.price.toFixed(2);
  if (body.data.location !== undefined) values.location = body.data.location;
  if (body.data.status !== undefined) {
    values.status = body.data.status;
    values.soldAt = body.data.status === "sold" ? new Date() : null;
  }
  (values as unknown as Record<string, unknown>).version = sql`${partsTable.version} + 1`;
  const [updated] = await db
    .update(partsTable)
    .set(values)
    .where(and(
      eq(partsTable.id, params.data.partId),
      eq(partsTable.version, body.data.expectedVersion),
    ))
    .returning();
  if (!updated) {
    const [latest] = await db
      .select()
      .from(partsTable)
      .where(eq(partsTable.id, params.data.partId))
      .limit(1);
    if (!latest) {
      res.status(404).json({ error: "Detalė nerasta." });
      return;
    }
    res.status(409).json({
      error: "Detalė buvo pakeista kitame įrenginyje. Įkelkite naujausią versiją ir pakartokite.",
      code: "VERSION_CONFLICT",
      current: serialize(latest),
    });
    return;
  }
  res.json(UpdatePartResponse.parse(serialize(updated)));
});

router.delete("/parts/:partId", async (req, res): Promise<void> => {
  const params = DeletePartParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Neteisingas detalės identifikatorius." });
    return;
  }
  const [deleted] = await db.transaction(async (tx) => {
    const [part] = await tx.select().from(partsTable).where(eq(partsTable.id, params.data.partId)).limit(1);
    if (!part) return [];
    const result = await tx.delete(partsTable).where(eq(partsTable.id, params.data.partId)).returning({ id: partsTable.id });
    if (result[0] && part.legacyId) {
      await tx.insert(syncTombstonesTable)
        .values({ entity: "part-legacy", recordId: part.legacyId })
        .onConflictDoNothing();
    }
    return result;
  });
  if (!deleted) {
    res.status(404).json({ error: "Detalė nerasta." });
    return;
  }
  res.sendStatus(204);
});

router.get("/public/parts/:publicId", async (req, res): Promise<void> => {
  const params = GetPublicPartParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Detalė nerasta." });
    return;
  }
  const [part] = await db
    .select()
    .from(partsTable)
    .where(eq(partsTable.publicId, params.data.publicId))
    .limit(1);
  if (!part) {
    res.status(404).json({ error: "Detalė nerasta." });
    return;
  }
  res.json(GetPublicPartResponse.parse(serialize(part)));
});

export default router;