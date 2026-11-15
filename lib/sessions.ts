import { db, rows, sql } from "./db";
import { audit, fail } from "./security";
export async function changeSessionStatus(id: string, status: "open" | "closed", adminId: string, database = db()) {
  return database.transaction(async (tx) => {
    await rows(sql`SELECT pg_advisory_xact_lock(940163)`, tx);
    const [session] = await rows(sql`SELECT *,now() AS server_now FROM writing_sessions WHERE id=${id} FOR UPDATE`, tx);
    if (!session) return fail(404, "Sesi tidak ditemukan.");
    if (status === "closed") {
      await rows(sql`UPDATE writing_sessions SET status='closed',updated_at=now() WHERE id=${id}`, tx);
    } else {
      const start = new Date(session.server_now).toISOString();
      const end = new Date(Math.max(new Date(session.end_at).getTime(), new Date(start).getTime() + 5 * 86400000)).toISOString();
      const conflicts = await rows(sql`SELECT id FROM writing_sessions WHERE id<>${id} AND status<>'closed' AND start_at<${end}::timestamptz AND end_at>${start}::timestamptz LIMIT 1`, tx);
      if (conflicts.length) return fail(409, "Jadwal bertabrakan dengan sesi lain. Tutup sesi tersebut terlebih dahulu.");
      await rows(sql`UPDATE writing_sessions SET status='open',start_at=${start},end_at=${end},updated_at=now() WHERE id=${id}`, tx);
    }
    await audit(adminId, status === "closed" ? "session.close" : "session.open", id, tx);
    return { id, status };
  });
}
export async function removeOrCloseSession(id: string, adminId: string, database = db()) {
  return database.transaction(async (tx) => {
    await rows(sql`SELECT pg_advisory_xact_lock(940163)`, tx);
    const [session] = await rows(sql`SELECT id FROM writing_sessions WHERE id=${id} FOR UPDATE`, tx);
    if (!session) return fail(404, "Sesi tidak ditemukan.");
    const used = await rows(sql`SELECT id FROM submissions WHERE session_id=${id} LIMIT 1`, tx);
    if (used.length) {
      await rows(sql`UPDATE writing_sessions SET status='closed',updated_at=now() WHERE id=${id}`, tx);
      await audit(adminId, "session.close", id, tx);
      return { deleted: false, closed: true };
    }
    await rows(sql`DELETE FROM writing_sessions WHERE id=${id}`, tx);
    await audit(adminId, "session.delete", id, tx);
    return { deleted: true, closed: false };
  });
}
