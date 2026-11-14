import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import bcrypt from "bcryptjs";
import {
  migrateDatabase,
  bootstrapAdmin,
  type SetupClient,
} from "../scripts/database-setup";
import { configurationError } from "../lib/config-errors";
function adapter(pg: PGlite): SetupClient {
  return {
    async query(text, values) {
      if (!values && text.split(";").filter((v) => v.trim()).length > 1) {
        const result = await pg.exec(text);
        return result.at(-1)!;
      }
      return pg.query(text, values);
    },
  };
}
test("fresh installation creates tables, applies migrations once, and can bootstrap login credentials", async () => {
  const pg = new PGlite();
  const client = adapter(pg);
  try {
    await migrateDatabase(client);
    await migrateDatabase(client);
    const m = await pg.query("SELECT name FROM schema_migrations");
    assert.equal(m.rows.length, 1);
    assert.equal(
      await bootstrapAdmin(client, "admin", "test-fixture-password-1234"),
      "created",
    );
    const r = await pg.query<{ password_hash: string }>(
      "SELECT password_hash FROM admins WHERE username='admin'",
    );
    assert.equal(
      await bcrypt.compare(
        "test-fixture-password-1234",
        r.rows[0].password_hash,
      ),
      true,
    );
    assert.equal(
      await bcrypt.compare("incorrect", r.rows[0].password_hash),
      false,
    );
    // Exercise the same parameterized rate-limit SQL used before login.
    const rate = await pg.query<{ count: number }>(
      "INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET count=rate_limits.count+1 RETURNING count",
      ["test-login", 900],
    );
    assert.equal(rate.rows[0].count, 1);
  } finally {
    await pg.close();
  }
});
test("subsequent deployment never overwrites existing admin password or adds an environment-selected account", async () => {
  const pg = new PGlite();
  const client = adapter(pg);
  try {
    await migrateDatabase(client);
    await bootstrapAdmin(client, "admin", "test-initial-password-1234");
    const before = await pg.query<{ password_hash: string }>(
      "SELECT password_hash FROM admins",
    );
    assert.equal(
      await bootstrapAdmin(client, "different-admin", "test-new-password-1234"),
      "existing",
    );
    const after = await pg.query<{ password_hash: string }>(
      "SELECT password_hash FROM admins",
    );
    assert.equal(after.rows.length, 1);
    assert.equal(after.rows[0].password_hash, before.rows[0].password_hash);
  } finally {
    await pg.close();
  }
});
test("bootstrap requires a valid password and stores no account when it is absent or invalid", async () => {
  const pg = new PGlite();
  const client = adapter(pg);
  try {
    await migrateDatabase(client);
    assert.equal(await bootstrapAdmin(client, "admin"), "missing-password");
    await assert.rejects(
      bootstrapAdmin(client, "admin", "short"),
      /BOOTSTRAP_PASSWORD_INVALID/,
    );
    assert.equal((await pg.query("SELECT id FROM admins")).rows.length, 0);
  } finally {
    await pg.close();
  }
});
test("wrapped database failures return actionable errors without exposing connection strings", () => {
  for (const code of ["42P01", "28P01", "ENOTFOUND", "CERT_HAS_EXPIRED"]) {
    const original = {
      cause: { code, message: "postgresql://private:password@host/database" },
    };
    const result = configurationError(original);
    assert.equal(result?.status, 503);
    assert.ok(!JSON.stringify(result).includes("private:password"));
  }
  assert.equal(
    configurationError(new Error("CONFIG_DATABASE"))?.code,
    "DATABASE_MISSING",
  );
  assert.equal(configurationError(new Error("unknown")), null);
});
