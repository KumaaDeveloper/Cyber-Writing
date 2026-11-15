import { db, rows, sql, type Executor } from "./db";
import {
  writerAccess,
  assertWriterAvailable,
  recordSubmission,
} from "./writers";
import { fail } from "./security";
import {
  type DocumentData,
  type Page,
  sessionOpen,
  canWrite,
  hasContent,
} from "./model";
export async function getDocument(
  id: string,
  e: Executor = db(),
): Promise<DocumentData & Record<string, any>> {
  const [s] = await rows(
    sql`SELECT s.owner_hash,s.id,s.title,s.status,s.is_starred,s.content_version,s.submitted_at,s.updated_at,s.session_id,s.theme_id,w.name,w.nim,w.email,w.membership_status,w.department,t.title AS theme_title,t.instructions,ws.title AS session_title,ws.status AS session_status,ws.start_at,ws.end_at,ws.max_pages FROM submissions s JOIN writers w ON w.id=s.writer_id JOIN session_themes t ON t.id=s.theme_id JOIN writing_sessions ws ON ws.id=s.session_id WHERE s.id=${id}`,
    e,
  );
  if (!s) fail(404, "Tulisan tidak ditemukan.");
  const pages = await rows<Page>(
    sql`SELECT id,title,content_json AS blocks FROM submission_pages WHERE submission_id=${id} ORDER BY page_number`,
    e,
  );
  const refs = await rows<DocumentData["references"][number]>(
    sql`SELECT id,title,url,publisher,to_char(accessed_at,'YYYY-MM-DD') AS accessed_at FROM submission_references WHERE submission_id=${id}`,
    e,
  );
  const notes = await rows(
    sql`SELECT id,page_id,note,created_at FROM admin_notes WHERE submission_id=${id} ORDER BY created_at DESC`,
    e,
  );
  const access = await writerAccess(s.owner_hash, s.nim, e);
  const { owner_hash, ...publicFields } = s;
  const sessionAvailable = sessionOpen({
    status: s.session_status,
    start_at: s.start_at,
    end_at: s.end_at,
  });
  return {
    ...publicFields,
    title: s.title,
    version: s.content_version,
    pages,
    references: refs.map((r) => ({ ...r, accessed_at: r.accessed_at || "" })),
    notes,
    writable: canWrite(s.status) && sessionAvailable && !access.locked,
    writer_next_allowed_at: access.next_allowed_at,
    writer_cooldown_hours: access.cooldown_hours,
    read_only_reason: !canWrite(s.status)
      ? "submitted"
      : !sessionAvailable
        ? "session_closed"
        : access.locked
          ? "cooldown"
          : null,
  };
}
export async function authorizeDocument(
  id: string,
  ownerHash: string,
  e: Executor = db(),
) {
  const [s] = await rows(
    sql`SELECT id FROM submissions WHERE id=${id} AND owner_hash=${ownerHash}`,
    e,
  );
  if (!s) fail(404, "Tulisan tidak ditemukan atau akses ditolak.");
}
export async function lockDocument(
  id: string,
  e: Executor,
  ownerHash?: string,
  allowSubmitted = false,
) {
  // A shared session lock prevents closure and limit changes during a writer mutation.
  const [meta] = await rows(
    sql`SELECT session_id FROM submissions WHERE id=${id}`,
    e,
  );
  if (!meta) fail(404, "Tulisan tidak ditemukan.");
  const [session] = await rows(
    sql`SELECT * FROM writing_sessions WHERE id=${meta.session_id} FOR SHARE`,
    e,
  );
  const [s] = await rows(
    sql`SELECT * FROM submissions WHERE id=${id} FOR UPDATE`,
    e,
  );
  if (!s || (ownerHash && s.owner_hash !== ownerHash))
    fail(404, "Tulisan tidak ditemukan atau akses ditolak.");
  if (
    ownerHash &&
    !(allowSubmitted && s.status === "submitted") &&
    (!sessionOpen(session as any) || !canWrite(s.status))
  )
    fail(
      403,
      "Tulisan sudah dikirim atau sesi telah berakhir. Salinan lokal tetap tersimpan.",
    );
  if (ownerHash && !(allowSubmitted && s.status === "submitted")) {
    const [writer] = await rows(
      sql`SELECT nim FROM writers WHERE id=${s.writer_id}`,
      e,
    );
    await assertWriterAvailable(ownerHash, writer.nim, e);
  }
  return { s, session };
}
export async function writeContent(id: string, doc: DocumentData, e: Executor) {
  await rows(sql`DELETE FROM submission_pages WHERE submission_id=${id}`, e);
  for (let i = 0; i < doc.pages.length; i++) {
    const p = doc.pages[i];
    await rows(
      sql`INSERT INTO submission_pages(id,submission_id,page_number,title,content_json) VALUES(${p.id},${id},${i + 1},${p.title},${JSON.stringify(p.blocks)}::jsonb)`,
      e,
    );
  }
  await rows(
    sql`DELETE FROM submission_references WHERE submission_id=${id}`,
    e,
  );
  for (const r of doc.references)
    await rows(
      sql`INSERT INTO submission_references(id,submission_id,title,url,publisher,accessed_at) VALUES(${r.id},${id},${r.title},${r.url},${r.publisher},${r.accessed_at || null})`,
      e,
    );
  await rows(
    sql`UPDATE submissions SET title=${doc.title},content_version=content_version+1,updated_at=now() WHERE id=${id}`,
    e,
  );
}
export async function saveDocument(
  id: string,
  doc: DocumentData,
  ownerHash?: string,
  adminId?: string,
  submit = false,
  database = db(),
) {
  return database.transaction(async (tx) => {
    const { s, session } = await lockDocument(id, tx, ownerHash, submit);
    if (submit && s.status === "submitted")
      return { version: s.content_version, status: s.status };
    if (s.content_version !== doc.version)
      fail(
        409,
        "Ada versi lebih baru. Unduh salinan lokal sebelum memuat versi server.",
      );
    if (doc.pages.length > session.max_pages)
      fail(400, `Maksimal ${session.max_pages} halaman.`);
    if (submit && !hasContent(doc.pages))
      fail(400, "Isi setidaknya satu halaman dengan tulisan.");
    await rows(
      sql`INSERT INTO submission_revisions(submission_id,content_version,snapshot,actor) VALUES(${id},${s.content_version},${JSON.stringify(await getDocument(id, tx))}::jsonb,${adminId ? "admin" : "writer"})`,
      tx,
    );
    await rows(
      sql`DELETE FROM submission_revisions WHERE submission_id=${id} AND id NOT IN (SELECT id FROM submission_revisions WHERE submission_id=${id} ORDER BY created_at DESC LIMIT 50)`,
      tx,
    );
    await writeContent(id, doc, tx);
    if (submit) {
      await rows(
        sql`UPDATE submissions SET status='submitted',submitted_at=now() WHERE id=${id}`,
        tx,
      );
      const [writer] = await rows(
        sql`SELECT nim FROM writers WHERE id=${s.writer_id}`,
        tx,
      );
      await recordSubmission(s.owner_hash, writer.nim, tx);
    }

    return {
      version: doc.version + 1,
      status: submit ? "submitted" : s.status,
    };
  });
}
