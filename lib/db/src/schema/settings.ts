import { createInsertSchema } from "drizzle-zod";
import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const syncSettingsTable = pgTable("sync_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertSyncSettingSchema = createInsertSchema(syncSettingsTable);
export type InsertSyncSetting = z.infer<typeof insertSyncSettingSchema>;
export type SyncSetting = typeof syncSettingsTable.$inferSelect;