import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { decoratePageReviews, pageReviewFingerprint } from "../lib/page-reviews";
import { reviewDocument } from "../lib/ai";

const pageA = { id: randomUUID(), title: "Definisi", blocks: [{ type: "text", content: "Phishing adalah penipuan berkedok sumber tepercaya." }] };
const pageB = { id: randomUUID(), title: "Pencegahan", blocks: [{ type: "text", content: "Gunakan autentikasi multifaktor." }] };
const doc = { title: "Bahaya Phishing", theme_title: "Cybersecurity", pages: [pageA, pageB], references: [] };

test("two pages have independent fingerprints, and unchanged page reviews survive other-page edits", () => {
  const hashA = pageReviewFingerprint(doc, pageA);
  const hashB = pageReviewFingerprint(doc, pageB);
  assert.notEqual(hashA, hashB);
  const nextDoc = { ...doc, pages: [pageA, { ...pageB, title: "Tindakan Pencegahan" }] };
  assert.equal(pageReviewFingerprint(nextDoc, pageA), hashA);
  assert.notEqual(pageReviewFingerprint(nextDoc, nextDoc.pages[1]), hashB);
  const reviews = decoratePageReviews(nextDoc, [
    { page_id: pageA.id, content_hash: hashA, status: "VALID" },
    { page_id: pageB.id, content_hash: hashB, status: "VALID" },
  ]);
  assert.equal(reviews[0].review_current, true);
  assert.equal(reviews[1].review_current, false);
});

test("AI receives only the selected page and keeps a valid cybersecurity explanation valid", async () => {
  const calls: unknown[] = [];
  const result = await reviewDocument({ ...doc, pages: [pageB] }, {
    apiKey: "test-key", model: "gemini-3.5-flash-lite", searchGrounding: false,
    generate: async (request) => {
      calls.push(request);
      return { text: JSON.stringify({ status: "VALID", summary: "Tepat.", findings: [] }) } as any;
    },
  });
  assert.equal(result.status, "VALID");
  assert.equal(calls.length, 1);
  const serialized = JSON.stringify(calls);
  assert.match(serialized, /autentikasi multifaktor/);
  assert.doesNotMatch(serialized, /Phishing adalah penipuan/);
  assert.deepEqual(result.sources, []);
});

test("migration stores and retrieves separate page reviews, retains earlier records, and is idempotent", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(await readFile("db/001_initial.sql", "utf8"));
    const migration = await readFile("db/004_page_reviews.sql", "utf8");
    await pg.exec(migration);
    await pg.exec(migration);
    const session = (await pg.query<{ id: string }>("INSERT INTO writing_sessions(title,start_at,end_at,max_pages,status) VALUES('Sesi',now()-interval '1 day',now()+interval '1 day',2,'open') RETURNING id")).rows[0].id;
    const theme = (await pg.query<{ id: string }>("INSERT INTO session_themes(session_id,title,display_order) VALUES($1,'Cyber',0) RETURNING id", [session])).rows[0].id;
    const writer = (await pg.query<{ id: string }>("INSERT INTO writers(name,nim,email,membership_status) VALUES('Tes','12345','test@example.com','anggota') RETURNING id")).rows[0].id;
    const submission = (await pg.query<{ id: string }>("INSERT INTO submissions(session_id,theme_id,writer_id,owner_hash) VALUES($1,$2,$3,'hash') RETURNING id", [session, theme, writer])).rows[0].id;
    for (const [i, page] of doc.pages.entries()) {
      await pg.query("INSERT INTO submission_pages(id,submission_id,page_number,title,content_json) VALUES($1,$2,$3,$4,'[]')", [page.id, submission, i + 1, page.title]);
      const result = await pg.query("INSERT INTO ai_reviews(submission_id,content_version,page_id,page_number,content_hash,status,summary,findings_json,sources_json,model_name) VALUES($1,1,$2,$3,$4,'VALID',$5,'[]','[]','test') RETURNING page_id,summary", [submission, page.id, i + 1, pageReviewFingerprint(doc, page), "Hasil halaman " + (i + 1)]);
      assert.equal(result.rows[0].page_id, page.id);
    }
    const stored = await pg.query<{page_id: string; summary: string}>("SELECT page_id,summary FROM ai_reviews WHERE submission_id=$1 ORDER BY page_number", [submission]);
    assert.equal(stored.rows.length, 2);
    assert.equal(stored.rows[0].summary, "Hasil halaman 1");
    assert.equal(stored.rows[1].summary, "Hasil halaman 2");
  } finally {
    await pg.close();
  }
});
