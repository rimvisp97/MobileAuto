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
import { db, partsTable } from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";
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
  };
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

  const legacyIds = body.data.parts.map((part) => part.legacyId);
  const existing = legacyIds.length
    ? await db.select().from(partsTable).where(inArray(partsTable.legacyId, legacyIds))
    : [];
  const existingIds = new Set(existing.map((part) => part.legacyId));
  const missing = body.data.parts.filter((part) => !existingIds.has(part.legacyId));

  if (missing.length) {
    await db.insert(partsTable).values(
      missing.map((part) => ({
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
    );
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

  const values: Partial<typeof partsTable.$inferInsert> = {};
  if (body.data.name !== undefined) values.name = body.data.name;
  if (body.data.code !== undefined) values.code = body.data.code;
  if (body.data.price !== undefined) values.price = body.data.price.toFixed(2);
  if (body.data.location !== undefined) values.location = body.data.location;
  if (body.data.status !== undefined) {
    values.status = body.data.status;
    values.soldAt = body.data.status === "sold" ? new Date() : null;
  }
  const [updated] = await db
    .update(partsTable)
    .set(values)
    .where(eq(partsTable.id, params.data.partId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Detalė nerasta." });
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
  const [deleted] = await db
    .delete(partsTable)
    .where(eq(partsTable.id, params.data.partId))
    .returning({ id: partsTable.id });
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