import { readFile, readdir } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
const resetKey = (id: string, resetId: string) =>
  "admin_password_reset:" +
  id +
  ":" +
  createHash("sha256").update(resetId).digest("hex");
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
  resetId?: string,
) {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(671024)");
    const existing = await client.query("SELECT id FROM admins LIMIT 1");
    if (existing.rows.length) {
      if (!resetId) {
        await client.query("COMMIT");
        return "existing";
      }
      if (resetId.length > 100) throw new Error("BOOTSTRAP_RESET_ID_INVALID");
      const account = await client.query(
        "SELECT id FROM admins WHERE username=$1",
        [username.trim()],
      );
      if (!account.rows.length) throw new Error("BOOTSTRAP_ADMIN_NOT_FOUND");
      const key = resetKey(account.rows[0].id, resetId);
      const previous = await client.query(
        "SELECT value FROM settings WHERE key=$1",
        [key],
      );
      if (previous.rows.length > 0) {
        await client.query("COMMIT");
        return "existing";
      }
      if (
        !password ||
        password.length < 12 ||
        Buffer.byteLength(password, "utf8") > 72
      )
        throw new Error("BOOTSTRAP_PASSWORD_INVALID");
      await client.query("UPDATE admins SET password_hash=$1 WHERE id=$2", [
        await bcrypt.hash(password, 12),
        account.rows[0].id,
      ]);
      await client.query("DELETE FROM admin_sessions WHERE admin_id=$1", [
        account.rows[0].id,
      ]);
      await client.query(
        "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [key, "done"],
      );
      await client.query(
        "INSERT INTO audit_log(admin_id,action,target_id) VALUES($1,'admin.password.reset.deploy',$2)",
        [account.rows[0].id, String(account.rows[0].id)],
      );
      await client.query("COMMIT");
      return "reset";
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
    const created = await client.query(
      "INSERT INTO admins(username,password_hash) VALUES($1,$2) RETURNING id",
      [username.trim(), await bcrypt.hash(password, 12)],
    );
    if (resetId) {
      if (resetId.length > 100) throw new Error("BOOTSTRAP_RESET_ID_INVALID");
      await client.query("INSERT INTO settings(key,value) VALUES($1,$2)", [
        resetKey(created.rows[0].id, resetId),
        "done",
      ]);
    }
    await client.query("COMMIT");
    return "created";
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
