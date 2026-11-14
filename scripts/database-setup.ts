import { readFile, readdir } from "node:fs/promises";
import bcrypt from "bcryptjs";
export interface SetupClient {
  query: (
    text: string,
    values?: any[],
  ) => Promise<{ rows: any[]; rowCount?: number | null }>;
}
export async function migrateDatabase(client: SetupClient, directory = "db") {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(671023)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const names = (await readdir(directory))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const name of names) {
      const applied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE name=$1",
        [name],
      );
      if (applied.rows.length) continue;
      await client.query(await readFile(`${directory}/${name}`, "utf8"));
      await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [
        name,
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
export async function bootstrapAdmin(
  client: SetupClient,
  username: string,
  password?: string,
) {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(671024)");
    const existing = await client.query("SELECT id FROM admins LIMIT 1");
    if (existing.rows.length) {
      await client.query("COMMIT");
      return "existing";
    }
    if (!password) {
      await client.query("COMMIT");
      return "missing-password";
    }
    if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
      throw new Error("BOOTSTRAP_PASSWORD_INVALID");
    }
    if (!username.trim() || username.length > 100)
      throw new Error("BOOTSTRAP_USERNAME_INVALID");
    await client.query(
      "INSERT INTO admins(username,password_hash) VALUES($1,$2)",
      [username.trim(), await bcrypt.hash(password, 12)],
    );
    await client.query("COMMIT");
    return "created";
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
