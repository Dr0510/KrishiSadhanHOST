
import { db } from './db';
import { users, equipment, bookings, reviews, comparisons, recommendations } from '@shared/schema';

async function createTables() {
  try {
    console.log('Creating database tables...');
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        is_admin BOOLEAN NOT NULL DEFAULT false,
        name TEXT NOT NULL,
        contact TEXT,
        language TEXT NOT NULL DEFAULT 'en',
        image_url TEXT,
        preferences JSONB NOT NULL DEFAULT '{"preferredCategories": [], "preferredLocations": [], "priceRange": {"min": 0, "max": 100000}, "features": []}'
      );

      CREATE TABLE IF NOT EXISTS equipment (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        daily_rate INTEGER NOT NULL,
        image_url TEXT NOT NULL,
        location TEXT NOT NULL,
        availability BOOLEAN NOT NULL DEFAULT true,
        specs JSONB NOT NULL DEFAULT '{}',
        features JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        popularity INTEGER NOT NULL DEFAULT 0,
        latitude_coord TEXT,
        longitude_coord TEXT,
        searchable_specs JSONB NOT NULL DEFAULT '{}',
        seasonal_availability JSONB NOT NULL DEFAULT '{"spring":true,"summer":true,"autumn":true,"winter":true}',
        last_maintenance_date TIMESTAMP,
        next_maintenance_date TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        equipment_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        total_price INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        razorpay_order_id TEXT,
        razorpay_payment_id TEXT,
        is_rated BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_status_update TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        equipment_id INTEGER NOT NULL,
        rating INTEGER NOT NULL,
        comment TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS comparisons (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        equipment_ids INTEGER[] NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS recommendations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        equipment_id INTEGER NOT NULL,
        score INTEGER NOT NULL,
        reason TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  }
}

createTables().catch(console.error);

export { createTables };
