import { db, rows, sql, type Executor } from "./db";
import { fail } from "./security";
import { type Identity, newPage, sessionOpen } from "./model";
export type WriterAccess = {
  cooldown_hours: number;
  locked: boolean;
  next_allowed_at: string | null;
};
export function cooldownState(
  last: Date | string | null,
  hours: number,
  now = new Date(),
): WriterAccess {
  const until =
    last && hours > 0
      ? new Date(new Date(last).getTime() + hours * 3600000)
      : null;
  return {
    cooldown_hours: hours,
    locked: !!until && until > now,
    next_allowed_at: until && until > now ? until.toISOString() : null,
  };
}
const keys = (ownerHash: string, nim?: string) =>
  ["browser:" + ownerHash, ...(nim ? ["nim:" + nim] : [])].sort();
export async function writerAccess(
  ownerHash: string | null,
  nim?: string,
  e: Executor = db(),
): Promise<WriterAccess> {
  const [setting] = await rows(
    sql`SELECT value,now() AS server_now FROM settings WHERE key='writer_cooldown_hours'`,
    e,
  );
  const hours = Number(setting?.value ?? 24);
  if (!ownerHash) return cooldownState(null, hours);
  const identityKeys = keys(ownerHash, nim);
  const [r] = await rows(
    sql`SELECT max(last_submitted_at) AS last FROM writer_cooldowns WHERE identity_key IN (${sql.join(
      identityKeys.map((k) => sql`${k}`),
      sql`,`,
    )})`,
    e,
  );
  return cooldownState(
    r.last,
    hours,
    new Date(setting?.server_now || Date.now()),
  );
}
export async function assertWriterAvailable(
  ownerHash: string,
  nim: string,
  e: Executor,
) {
  for (const key of keys(ownerHash, nim))
    await rows(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`, e);
  const access = await writerAccess(ownerHash, nim, e);
  if (access.locked)
    fail(
      423,
      "Penulisan dikunci sementara. Bisa menulis lagi pada " +
        new Intl.DateTimeFormat("id-ID", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Jakarta",
        }).format(new Date(access.next_allowed_at!)) +
        " WIB.",
    );
  return access;
}
export async function recordSubmission(
  ownerHash: string,
  nim: string,
  e: Executor,
) {
  for (const key of keys(ownerHash, nim))
    await rows(
      sql`INSERT INTO writer_cooldowns(identity_key,last_submitted_at) VALUES(${key},now()) ON CONFLICT(identity_key) DO UPDATE SET last_submitted_at=excluded.last_submitted_at`,
      e,
    );
}
export async function createDraft(
  identity: Identity,
  sessionId: string,
  themeId: string,
  ownerHash: string,
  database = db(),
) {
  return database.transaction(async (tx) => {
    const [session] = await rows(
      sql`SELECT * FROM writing_sessions WHERE id=${sessionId} FOR SHARE`,
      tx,
    );
    if (!session || !sessionOpen(session as any))
      fail(403, "Sesi tidak tersedia.");
    const [theme] = await rows(
      sql`SELECT id FROM session_themes WHERE id=${themeId} AND session_id=${sessionId} AND available`,
      tx,
    );
    if (!theme) fail(400, "Tema tidak tersedia.");
    const [pattern] = await rows(
      sql`SELECT value FROM settings WHERE key='nim_pattern'`,
      tx,
    );
    if (pattern && !new RegExp(pattern.value).test(identity.nim))
      fail(400, "NIM tidak sesuai aturan sesi.");
    await assertWriterAvailable(ownerHash, identity.nim, tx);
    const [existing] = await rows(
      sql`SELECT id FROM submissions WHERE owner_hash=${ownerHash} AND session_id=${sessionId} AND status IN ('draft','revision') ORDER BY updated_at DESC LIMIT 1`,
      tx,
    );
    if (existing) return existing;
    const [writer] = await rows(
      sql`INSERT INTO writers(name,nim,email,membership_status,department) VALUES(${identity.name},${identity.nim},${identity.email},${identity.membership_status},${identity.membership_status === "pengurus" ? identity.department : null}) RETURNING id`,
      tx,
    );
    const [draft] = await rows(
      sql`INSERT INTO submissions(session_id,theme_id,writer_id,owner_hash) VALUES(${sessionId},${themeId},${writer.id},${ownerHash}) RETURNING id`,
      tx,
    );
    const p = newPage();
    await rows(
      sql`INSERT INTO submission_pages(id,submission_id,page_number,title,content_json) VALUES(${p.id},${draft.id},1,'Halaman pertama',${JSON.stringify(p.blocks)}::jsonb)`,
      tx,
    );
    return draft;
  });
}
