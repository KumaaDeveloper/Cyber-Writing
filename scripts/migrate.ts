import { Pool } from "pg";
import { migrateDatabase } from "./database-setup";
if (!process.env.DATABASE_URL)
  throw new Error("Isi DATABASE_URL di .env.local.");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
});
try {
  const client = await pool.connect();
  try {
    await migrateDatabase(client);
    console.log("Database schema ready.");
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
