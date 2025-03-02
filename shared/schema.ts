import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const equipment = pgTable("equipment", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  dailyRate: integer("daily_rate").notNull(),
  imageUrl: text("image_url").notNull(),
  available: boolean("available").notNull().default(true)
});

export const rentals = pgTable("rentals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  equipmentId: integer("equipment_id").notNull().references(() => equipment.id),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  status: text("status").notNull().default("pending")
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertEquipmentSchema = createInsertSchema(equipment).pick({
  name: true,
  description: true,
  category: true,
  dailyRate: true,
  imageUrl: true,
  available: true,
});

export const insertRentalSchema = createInsertSchema(rentals).pick({
  userId: true,
  equipmentId: true,
  startDate: true,
  endDate: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;
export type InsertRental = z.infer<typeof insertRentalSchema>;
export type User = typeof users.$inferSelect;
export type Equipment = typeof equipment.$inferSelect;
export type Rental = typeof rentals.$inferSelect;
