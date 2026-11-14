import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
let instance: ReturnType<typeof drizzle> | undefined;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("CONFIG_DATABASE");
  if (!instance)
    instance = drizzle(
      new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 5,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 20000,
      }),
    );
  return instance;
}
export { sql };
export type DB = ReturnType<typeof db>;
export type TX = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | TX;
export async function rows<T = Record<string, any>>(
  q: ReturnType<typeof sql>,
  executor: Executor = db(),
): Promise<T[]> {
  return (await executor.execute(q)).rows as T[];
}
