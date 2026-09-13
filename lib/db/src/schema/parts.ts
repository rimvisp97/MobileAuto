import { createInsertSchema } from "drizzle-zod";
import {
  index,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  integer,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const partsTable = pgTable(
  "parts",
  {
    id: serial("id").primaryKey(),
    publicId: text("public_id").notNull(),
    legacyId: text("legacy_id"),
    donorId: text("donor_id").notNull(),
    donorLabel: text("donor_label").notNull(),
    name: text("name").notNull(),
    code: text("code").notNull().default(""),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    status: text("status").notNull().default("inventory"),
    location: text("location"),
    soldAt: timestamp("sold_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("parts_public_id_unique").on(table.publicId),
    uniqueIndex("parts_legacy_id_unique").on(table.legacyId),
    index("parts_donor_id_idx").on(table.donorId),
    index("parts_updated_at_idx").on(table.updatedAt),
  ],
);

export const insertPartSchema = createInsertSchema(partsTable).omit({
  id: true,
  publicId: true,
  soldAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPart = z.infer<typeof insertPartSchema>;
export type Part = typeof partsTable.$inferSelect;