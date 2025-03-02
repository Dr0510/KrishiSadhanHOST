import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const equipments = pgTable("equipments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  dailyRate: integer("daily_rate").notNull(),
  available: boolean("available").default(true),
  imageUrl: text("image_url").notNull()
});

export const rentals = pgTable("rentals", {
  id: serial("id").primaryKey(),
  equipmentId: integer("equipment_id").notNull(),
  customerName: text("customer_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  status: text("status").notNull().default('pending')
});

export const insertEquipmentSchema = createInsertSchema(equipments).omit({ id: true });
export const insertRentalSchema = createInsertSchema(rentals).omit({ id: true });

export type Equipment = typeof equipments.$inferSelect;
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;
export type Rental = typeof rentals.$inferSelect;
export type InsertRental = z.infer<typeof insertRentalSchema>;
