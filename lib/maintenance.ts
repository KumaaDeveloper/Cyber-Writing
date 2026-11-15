import { db, rows, sql } from "./db";
import { queueAssetDeletion } from "./assets";
export async function cleanupExpiredDrafts(database = db(), batchSize = 100) {
  return database.transaction(async (tx) => {
    const [lock] = await rows(sql`SELECT pg_try_advisory_xact_lock(940165) AS acquired`, tx);
    if (!lock.acquired) return 0;
    const expired = await rows<{ id: string; writer_id: string }>(sql`SELECT id,writer_id FROM submissions WHERE status='draft' AND updated_at<=now()-interval '24 hours' ORDER BY updated_at LIMIT ${batchSize} FOR UPDATE SKIP LOCKED`, tx);
    for (const draft of expired) {
      await queueAssetDeletion(draft.id, tx);
      await rows(sql`DELETE FROM submissions WHERE id=${draft.id}`, tx);
      await rows(sql`DELETE FROM writers WHERE id=${draft.writer_id} AND NOT EXISTS(SELECT 1 FROM submissions WHERE writer_id=${draft.writer_id})`, tx);
    }
    return expired.length;
  });
}
