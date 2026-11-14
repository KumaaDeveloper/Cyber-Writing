import bcrypt from "bcryptjs";
import { Pool } from "pg";
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
if (
  !password ||
  password.length < 12 ||
  Buffer.byteLength(password, "utf8") > 72
)
  throw new Error(
    "Set ADMIN_BOOTSTRAP_PASSWORD to 12+ characters and at most 72 UTF-8 bytes.",
  );
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await pool.query(
    "INSERT INTO admins(username,password_hash) VALUES($1,$2) ON CONFLICT(username) DO NOTHING RETURNING id",
    [process.env.ADMIN_USERNAME || "admin", await bcrypt.hash(password, 12)],
  );
  console.log(
    result.rowCount
      ? "Admin created. Remove bootstrap password from environment."
      : "Admin already exists; no password was changed.",
  );
} finally {
  await pool.end();
}
