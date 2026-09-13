import { primaryKey, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const syncTombstonesTable = pgTable(
  "sync_tombstones",
  {
    entity: text("entity").notNull(),
    recordId: text("record_id").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.entity, table.recordId] })],
);

export type SyncTombstone = typeof syncTombstonesTable.$inferSelect;