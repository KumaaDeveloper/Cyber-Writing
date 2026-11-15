import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrateDatabase, type SetupClient } from "../scripts/database-setup";
import { getDocument, saveDocument, writeContent } from "../lib/documents";
import { checkPage, listPageReviews, reviewSummaryJoin } from "../lib/reviews";
import { rows, sql, type DB } from "../lib/db";
import type { reviewDocument } from "../lib/ai";
import { checkPages } from "../lib/review-runner";
const pg = new PGlite();
const database = drizzle(pg) as unknown as DB;
const client: SetupClient = { async query(text, values) {
  if (!values && text.split(";").filter((x) => x.trim()).length > 1) return (await pg.exec(text)).at(-1)!;
  return pg.query(text, values);
} };
let session: string, theme: string, writer: string;
before(async () => {
  await migrateDatabase(client);
  session = (await pg.query<{ id: string }>("INSERT INTO writing_sessions(title,start_at,end_at,max_pages,status) VALUES('Test',now()-interval '1 day',now()+interval '1 day',8,'open') RETURNING id")).rows[0].id;
  theme = (await pg.query<{ id: string }>("INSERT INTO session_themes(session_id,title,display_order) VALUES($1,'Phishing',0) RETURNING id", [session])).rows[0].id;
  writer = (await pg.query<{ id: string }>("INSERT INTO writers(name,nim,email,membership_status) VALUES('Private Author','0012345678','private@example.com','anggota') RETURNING id")).rows[0].id;
});
after(() => pg.close());
async function fixture() {
  const id = (await pg.query<{ id: string }>("INSERT INTO submissions(session_id,theme_id,writer_id,owner_hash) VALUES($1,$2,$3,'owner') RETURNING id", [session, theme, writer])).rows[0].id;
  const pages = [1, 2].map((index) => ({ id: randomUUID(), title: `Bagian ${index}`, blocks: [{
    id: randomUUID(), type: "text" as const, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: `Materi halaman ${index}` }] }] },
  }] }));
  await writeContent(id, { title: "Phishing", version: 1, references: [], pages }, database);
  return getDocument(id, database);
}
const result = (status: "VALID" | "KURANG VALID" | "TIDAK VALID" = "VALID") => ({
  status, summary: "Ringkasan tersimpan", findings: [{ page: 1, claim: "Klaim uji", status, reason: "Alasan konkret", suggestion: "Saran uji" }],
  sources: [], search_html: "", model: "gemini-3.5-flash-lite",
});
const review: typeof reviewDocument = async () => result();
async function overview(id: string) {
  return (await rows(sql`SELECT r.* FROM submissions s ${reviewSummaryJoin} WHERE s.id=${id}`, database))[0];
}
test("two pages are sent separately, saved independently, and read back with the correct page numbers", async () => {
  const doc = await fixture(), calls: any[] = [];
  const generate: typeof reviewDocument = async (payload) => { calls.push(payload); return result(); };
  for (const page of doc.pages) await checkPage(doc, page.id, { database, review: generate });
  assert.equal(calls.length, 2);
  for (let i = 0; i < 2; i++) {
    assert.equal(calls[i].pages.length, 1);
    assert.equal(calls[i].pages[0].id, doc.pages[i].id);
    assert.ok(!JSON.stringify(calls[i]).includes("Private Author"));
    assert.ok(!JSON.stringify(calls[i]).includes("private@example.com"));
  }
  const loaded = await listPageReviews(await getDocument(doc.id, database), database);
  assert.equal(loaded.length, 2);
  assert.deepEqual(loaded.map((r) => r.findings_json[0].page), [1, 2]);
  assert.ok(loaded.every((r) => r.is_current));
  assert.equal((await overview(doc.id)).status, "VALID");
  await checkPage(doc, doc.pages[0].id, { database, force: true, review: async () => result("TIDAK VALID") });
  assert.equal((await overview(doc.id)).status, "TIDAK VALID", "a VALID last page must not hide an incorrect earlier page");
  await checkPage(doc, doc.pages[0].id, { database, force: true, review: async () => result("KURANG VALID") });
  assert.equal((await overview(doc.id)).status, "KURANG VALID");
});
test("a second-page provider failure retains the first result and retry reuses it", async () => {
  const doc = await fixture();
  await checkPage(doc, doc.pages[0].id, { database, review });
  await assert.rejects(checkPage(doc, doc.pages[1].id, { database, review: async () => { throw new Error("provider offline"); } }));
  assert.equal((await listPageReviews(doc, database)).length, 1);
  assert.equal((await overview(doc.id)).status, "BELUM LENGKAP");
  let calls = 0;
  const generate: typeof reviewDocument = async () => { calls++; return result("TIDAK VALID"); };
  await checkPage(doc, doc.pages[0].id, { database, review: generate });
  assert.equal(calls, 0);
  await checkPage(doc, doc.pages[1].id, { database, review: generate });
  assert.equal(calls, 1);
  assert.equal((await overview(doc.id)).status, "TIDAK VALID");
});
test("saving an edited second page preserves both reviews, invalidates only that page and reuses the first", async () => {
  let doc = await fixture();
  for (const page of doc.pages) await checkPage(doc, page.id, { database, review });
  await saveDocument(doc.id, { ...doc, pages: doc.pages.map((page, i) => i === 1 ? { ...page, title: "Diubah" } : page) }, undefined, undefined, false, database);
  doc = await getDocument(doc.id, database);
  const loaded = await listPageReviews(doc, database);
  assert.deepEqual(loaded.map((r) => r.is_current), [true, false]);
  const calls: any[] = [];
  for (const page of doc.pages) await checkPage(doc, page.id, { database, review: async (payload) => { calls.push(payload); return result(); } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].pages[0].id, doc.pages[1].id);
  assert.ok((await listPageReviews(doc, database)).every((r) => r.is_current));
  assert.equal((await overview(doc.id)).content_version, doc.version);
});
test("page reorder reuses saved results, force replaces only its own result, and removed pages stay out of the list", async () => {
  let doc = await fixture();
  for (const page of doc.pages) await checkPage(doc, page.id, { database, review });
  await saveDocument(doc.id, { ...doc, pages: [...doc.pages].reverse() }, undefined, undefined, false, database);
  doc = await getDocument(doc.id, database);
  const before = await listPageReviews(doc, database);
  assert.deepEqual(before.map((r) => r.findings_json[0].page), [1, 2]);
  assert.ok(before.every((r) => r.is_current));
  const forced = await checkPage(doc, doc.pages[0].id, { database, force: true, review: async () => result("KURANG VALID") });
  assert.equal(forced.id, before[0].id);
  assert.equal((await listPageReviews(doc, database))[1].status, "VALID");
  await saveDocument(doc.id, { ...doc, pages: [doc.pages[1]] }, undefined, undefined, false, database);
  doc = await getDocument(doc.id, database);
  assert.equal((await listPageReviews(doc, database)).length, 1);
  await assert.rejects(checkPage(doc, before[0].page_id, { database, review }), (error: any) => error.status === 404);
});
test("edits during generation reject stale output before it is saved", async () => {
  const doc = await fixture();
  await assert.rejects(checkPage(doc, doc.pages[0].id, { database, review: async () => {
    await saveDocument(doc.id, { ...doc, pages: doc.pages.map((page, i) => i === 0 ? { ...page, title: "Changed while checking" } : page) }, undefined, undefined, false, database);
    return result();
  } }), (error: any) => error.status === 409);
  assert.deepEqual(await listPageReviews(await getDocument(doc.id, database), database), []);
});
test("legacy whole-document reviews are retained without being reused as page results", async () => {
  const doc = await fixture();
  await pg.query("INSERT INTO ai_reviews(submission_id,content_version,status,summary,findings_json,sources_json,model_name) VALUES($1,$2,'KURANG VALID','legacy','[]','[]','old-model')", [doc.id, doc.version]);
  assert.deepEqual(await listPageReviews(doc, database), []);
  await checkPage(doc, doc.pages[0].id, { database, review });
  const count = await pg.query<{ count: number }>("SELECT count(*)::int AS count FROM ai_reviews WHERE submission_id=$1", [doc.id]);
  assert.equal(count.rows[0].count, 2);
  assert.equal((await listPageReviews(doc, database))[0].status, "VALID");
});
test("the client checks one page at a time and retains completed results when the next fails", async () => {
  const order: string[] = [], progress: number[] = [];
  let shown: any[] = [];
  await assert.rejects(checkPages([{ id: "one" }, { id: "two" }], async (id) => {
    order.push(id);
    if (id === "two") throw new Error("offline");
    return { items: [{ page_id: id }] };
  }, (items) => { shown = items; }, (index) => { progress.push(index); }), /Halaman 2: offline/);
  assert.deepEqual(order, ["one", "two"]);
  assert.deepEqual(progress, [1, 2]);
  assert.deepEqual(shown, [{ page_id: "one" }]);
});
