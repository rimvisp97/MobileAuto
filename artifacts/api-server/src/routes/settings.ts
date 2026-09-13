import {
  DeleteSyncSettingParams,
  ListSyncSettingsResponse,
  UpsertSyncSettingBody,
  UpsertSyncSettingParams,
  UpsertSyncSettingResponse,
} from "@workspace/api-zod";
import { db, syncSettingsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";

const router: IRouter = Router();

function serialize(row: typeof syncSettingsTable.$inferSelect) {
  return {
    key: row.key,
    value: row.value as Record<string, unknown>,
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

function settingKey(value: string | string[] | undefined) {
  const joined = Array.isArray(value) ? value.join("/") : value ?? "";
  return decodeURIComponent(joined);
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

router.get("/settings", async (_req, res): Promise<void> => {
  const rows = await db.select().from(syncSettingsTable).orderBy(syncSettingsTable.key);
  res.json(ListSyncSettingsResponse.parse(rows.map(serialize)));
});

router.put("/settings/*key", async (req, res): Promise<void> => {
  const params = UpsertSyncSettingParams.safeParse({ key: settingKey(req.params.key) });
  const parsed = UpsertSyncSettingBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Neteisingi bendrų nustatymų duomenys." });
    return;
  }
  const current = await db
    .select()
    .from(syncSettingsTable)
    .where(eq(syncSettingsTable.key, params.data.key))
    .limit(1);
  const existing = current[0];
  if (!existing) {
    const [created] = await db
      .insert(syncSettingsTable)
      .values({ key: params.data.key, value: parsed.data.value, version: 1 })
      .onConflictDoNothing({ target: syncSettingsTable.key })
      .returning();
    if (!created) {
      const [raced] = await db
        .select()
        .from(syncSettingsTable)
        .where(eq(syncSettingsTable.key, params.data.key))
        .limit(1);
      sendConflict(res, "Nustatymas sukurtas kitame įrenginyje.", raced && serialize(raced));
      return;
    }
    res.json(UpsertSyncSettingResponse.parse(serialize(created)));
    return;
  }
  // An existing shared setting must carry its observed version.  This makes a
  // first-time browser migration additive and prevents a stale profile from
  // silently replacing one saved on another device.
  if (parsed.data.expectedVersion === undefined) {
    sendConflict(
      res,
      "Nustatymas jau egzistuoja. Perskaitykite naujausią versiją prieš jį keisdami.",
      serialize(existing),
    );
    return;
  }
  const [updated] = await db
    .update(syncSettingsTable)
    .set({
      value: parsed.data.value,
      version: sql`${syncSettingsTable.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(syncSettingsTable.key, params.data.key),
        eq(syncSettingsTable.version, parsed.data.expectedVersion),
      ),
    )
    .returning();
  if (!updated) {
    const [latest] = await db
      .select()
      .from(syncSettingsTable)
      .where(eq(syncSettingsTable.key, params.data.key))
      .limit(1);
    sendConflict(
      res,
      "Nustatymas buvo pakeistas kitame įrenginyje.",
      latest && serialize(latest),
    );
    return;
  }
  res.json(UpsertSyncSettingResponse.parse(serialize(updated)));
});

router.delete("/settings/*key", async (req, res): Promise<void> => {
  const params = DeleteSyncSettingParams.safeParse({ key: settingKey(req.params.key) });
  if (!params.success) {
    res.status(400).json({ error: "Neteisingas nustatymo raktas." });
    return;
  }
  const [deleted] = await db
    .delete(syncSettingsTable)
    .where(eq(syncSettingsTable.key, params.data.key))
    .returning({ key: syncSettingsTable.key });
  if (!deleted) {
    res.status(404).json({ error: "Nustatymas nerastas." });
    return;
  }
  res.sendStatus(204);
});

export default router;