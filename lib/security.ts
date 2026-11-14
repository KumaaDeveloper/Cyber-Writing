import { cookies } from "next/headers";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { rows, sql, type Executor } from "./db";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const fail = (status: number, message: string): never => {
  throw new AppError(status, message);
};
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
export async function owner(create = false) {
  const jar = await cookies();
  let token = jar.get("cw_writer")?.value;
  if (!token && create) {
    token = randomBytes(32).toString("base64url");
    jar.set("cw_writer", token, { ...options, maxAge: 60 * 60 * 24 * 365 });
  }
  if (!token) fail(401, "Draft hanya dapat dibuka di browser asal.");
  return hash(token!);
}
export async function admin() {
  const token = (await cookies()).get("cw_admin")?.value;
  if (!token) fail(401, "Silakan masuk sebagai admin.");
  const [a] = await rows(
    sql`SELECT a.id,a.username FROM admin_sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=${hash(token!)} AND s.expires_at>now()`,
  );
  if (!a) fail(401, "Sesi admin berakhir. Silakan masuk kembali.");
  return a;
}
export async function setAdminSession(id: string) {
  const token = randomBytes(32).toString("base64url");
  await rows(
    sql`INSERT INTO admin_sessions(token_hash,admin_id,expires_at) VALUES(${hash(token)},${id},now()+interval '8 hours')`,
  );
  (await cookies()).set("cw_admin", token, { ...options, maxAge: 28800 });
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get("cw_admin")?.value;
  if (token)
    await rows(sql`DELETE FROM admin_sessions WHERE token_hash=${hash(token)}`);
  jar.delete("cw_admin");
}
export function checkOrigin(req: Request) {
  if (req.method === "GET") return;
  const configured = process.env.APP_URL;
  if (!configured) fail(503, "APP_URL belum dikonfigurasi.");
  let origin: string;
  try {
    origin = new URL(configured!).origin;
  } catch {
    fail(503, "APP_URL tidak valid.");
  }
  if (req.headers.get("origin") !== origin!)
    fail(403, "Permintaan lintas situs ditolak.");
}
export async function limit(key: string, max: number, seconds: number) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    fail(503, "AUTH_SECRET belum dikonfigurasi.");
  const k = createHmac("sha256", secret!).update(key).digest("hex");
  const [r] = await rows(
    sql`INSERT INTO rate_limits(key,count,expires_at) VALUES(${k},1,now()+${seconds}*interval '1 second') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END,expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+${seconds}*interval '1 second' ELSE rate_limits.expires_at END RETURNING count`,
  );
  if (Number(r.count) > max)
    fail(429, "Terlalu banyak percobaan. Coba kembali beberapa saat lagi.");
}
export function clientIP(req: Request) {
  return (
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "local"
  );
}
export async function audit(
  adminId: string,
  action: string,
  target: string,
  e?: Executor,
) {
  await rows(
    sql`INSERT INTO audit_log(admin_id,action,target_id) VALUES(${adminId},${action},${target})`,
    e,
  );
}
export async function readJson(req: Request) {
  const text = await req.text();
  if (text.length > 1100000) fail(413, "Data terlalu besar.");
  try {
    return JSON.parse(text);
  } catch {
    return fail(400, "Data JSON tidak valid.");
  }
}
