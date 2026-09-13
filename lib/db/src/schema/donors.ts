import { createInsertSchema } from "drizzle-zod";
import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const donorsTable = pgTable(
  "donors",
  {
    id: text("id").primaryKey(),
    year: integer("year").notNull(),
    make: text("make").notNull(),
    model: text("model").notNull(),
    engine: text("engine").notNull(),
    fuel: text("fuel").notNull(),
    mileage: integer("mileage").notNull(),
    purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }).notNull(),
    status: text("status").notNull().default("active"),
    location: text("location"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("donors_status_idx").on(table.status),
    index("donors_updated_at_idx").on(table.updatedAt),
  ],
);

export const insertDonorSchema = createInsertSchema(donorsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertDonor = z.infer<typeof insertDonorSchema>;
export type Donor = typeof donorsTable.$inferSelect;