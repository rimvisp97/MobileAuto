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

export const vehiclesTable = pgTable(
  "vehicles",
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
    salePrice: numeric("sale_price", { precision: 12, scale: 2 }),
    askingPrice: numeric("asking_price", { precision: 12, scale: 2 }),
    purchaseDate: text("purchase_date"),
    vin: text("vin"),
    registration: text("registration"),
    location: text("location"),
    source: text("source"),
    notes: text("notes"),
    soldAt: text("sold_at"),
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
    index("vehicles_status_idx").on(table.status),
    index("vehicles_updated_at_idx").on(table.updatedAt),
  ],
);

export const vehicleExpensesTable = pgTable(
  "vehicle_expenses",
  {
    id: text("id").primaryKey(),
    vehicleId: text("vehicle_id")
      .notNull()
      .references(() => vehiclesTable.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    date: text("date").notNull(),
    category: text("category"),
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
    index("vehicle_expenses_vehicle_id_idx").on(table.vehicleId),
    index("vehicle_expenses_updated_at_idx").on(table.updatedAt),
  ],
);

export const insertVehicleSchema = createInsertSchema(vehiclesTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertVehicleExpenseSchema = createInsertSchema(
  vehicleExpensesTable,
).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehiclesTable.$inferSelect;
export type VehicleExpense = typeof vehicleExpensesTable.$inferSelect;