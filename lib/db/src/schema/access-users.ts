import { createInsertSchema } from "drizzle-zod";
import { jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const accessUsersTable = pgTable("access_users", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").unique(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("employee"),
  status: text("status").notNull().default("pending"),
  permissions: jsonb("permissions")
    .$type<Record<string, boolean>>()
    .notNull()
    .default({}),
  invitationId: text("invitation_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertAccessUserSchema = createInsertSchema(accessUsersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAccessUser = z.infer<typeof insertAccessUserSchema>;
export type AccessUser = typeof accessUsersTable.$inferSelect;