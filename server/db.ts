import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import dotenv from "dotenv";
dotenv.config();


// Configure WebSocket for Neon connection
neonConfig.webSocketConstructor = ws;
neonConfig.useSecureWebSocket = true; // Ensure secure WebSocket connection

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set in environment variables");
}

// Create connection pool with better error handling and configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  keepAlive: true,
  ssl: true
});

// Add error handler for the pool
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
  process.exit(-1); // Exit on critical database errors
});

// Export database client
export const db = drizzle(pool, { schema });

// Verify database connection on startup with retries
async function testConnection(retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      console.log('Database connection verified successfully');
      return;
    } catch (err) {
      console.error(`Database connection attempt ${i + 1} failed:`, err);
      if (i === retries - 1) {
        console.error('All database connection attempts failed');
        process.exit(1);
      }
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

// Initialize connection test
testConnection().catch(err => {
  console.error('Failed to establish database connection:', err);
  process.exit(1);
});

export { pool };