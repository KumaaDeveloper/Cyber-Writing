import nextEnv from "@next/env";
import { Pool } from "pg";
import { spawn } from "node:child_process";
import { migrateDatabase, bootstrapAdmin } from "./database-setup";
import { configurationError } from "../lib/config-errors";
nextEnv.loadEnvConfig(process.cwd(), false);
if (process.env.DATABASE_URL && process.env.VERCEL_ENV !== "preview") {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 15000,
  });
  try {
    const client = await pool.connect();
    try {
      await migrateDatabase(client);
      console.log("[setup] Database schema ready.");
      const result = await bootstrapAdmin(
        client,
        process.env.ADMIN_USERNAME || "admin",
        process.env.ADMIN_BOOTSTRAP_PASSWORD,
      );
      console.log(
        result === "created"
          ? "[setup] Admin created. Remove ADMIN_BOOTSTRAP_PASSWORD after deployment."
          : result === "existing"
            ? "[setup] Existing admin retained; password unchanged."
            : "[setup] No admin yet. Set ADMIN_BOOTSTRAP_PASSWORD and redeploy, or run admin:bootstrap.",
      );
    } finally {
      client.release();
    }
  } catch (error) {
    const diagnostic = configurationError(error);
    console.error(
      "[setup]",
      diagnostic?.error ||
        "Setup database gagal. Periksa koneksi Neon dan izin migrasi.",
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
} else {
  console.log(
    process.env.VERCEL_ENV === "preview"
      ? "[setup] Preview: automatic database changes skipped."
      : "[setup] DATABASE_URL absent; skipping database setup.",
  );
}
if (!process.exitCode) {
  const child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "build"],
    { stdio: "inherit", env: process.env },
  );
  child.on("exit", (code) => {
    process.exitCode = code || 0;
  });
}
