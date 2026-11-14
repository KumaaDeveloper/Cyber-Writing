import { Pool } from "pg";
import { bootstrapAdmin } from "./database-setup";
if (!process.env.DATABASE_URL)
  throw new Error("Isi DATABASE_URL di .env.local.");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
});
try {
  const client = await pool.connect();
  try {
    const result = await bootstrapAdmin(
      client,
      process.env.ADMIN_USERNAME || "admin",
      process.env.ADMIN_BOOTSTRAP_PASSWORD,
      process.env.ADMIN_PASSWORD_RESET_ID,
    );
    if (result === "missing-password")
      throw new Error("Isi ADMIN_BOOTSTRAP_PASSWORD di .env.local.");
    console.log(
      result === "created"
        ? "Admin created. Remove bootstrap password from environment."
        : result === "reset"
          ? "Admin password reset; existing sessions revoked."
          : "Admin already exists; no password was changed.",
    );
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
