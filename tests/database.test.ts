import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getDocument, saveDocument, authorizeDocument } from "../lib/documents";
import { type DB } from "../lib/db";
import { AppError } from "../lib/security";
import { type DocumentData } from "../lib/model";
const pg = new PGlite();
const database = drizzle(pg) as unknown as DB;
let id: string,
  session: string,
  owner = "test-owner-only",
  otherOwner = "test-other-owner";
before(async () => {
  await pg.exec(await readFile("db/001_initial.sql", "utf8"));
  const s = await pg.query<{ id: string }>(
    "INSERT INTO writing_sessions(title,start_at,end_at,max_pages,status) VALUES('Test session',now()-interval '1 day',now()+interval '1 day',2,'open') RETURNING id",
  );
  session = s.rows[0].id;
  const t = await pg.query<{ id: string }>(
    "INSERT INTO session_themes(session_id,title,display_order) VALUES($1,'Phishing',0) RETURNING id",
    [session],
  );
  const w = await pg.query<{ id: string }>(
    "INSERT INTO writers(name,nim,email,membership_status) VALUES('Test Writer','00123456','qa@example.com','anggota') RETURNING id",
  );
  const s2 = await pg.query<{ id: string }>(
    "INSERT INTO submissions(session_id,theme_id,writer_id,owner_hash) VALUES($1,$2,$3,$4) RETURNING id",
    [session, t.rows[0].id, w.rows[0].id, owner],
  );
  id = s2.rows[0].id;
  await pg.query(
    "INSERT INTO submission_pages(id,submission_id,page_number,title) VALUES($1,$2,1,'Pengantar')",
    [randomUUID(), id],
  );
});
after(() => pg.close());
const body = async (): Promise<DocumentData> => {
  const d = await getDocument(id, database);
  return {
    title: d.title,
    version: d.version,
    pages: d.pages as any,
    references: d.references as any,
  };
};
const textPage = () => ({
  id: randomUUID(),
  title: "Cara mengenali phishing",
  blocks: [
    {
      id: randomUUID(),
      type: "text" as const,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Periksa domain sumber pesan." }],
          },
        ],
      },
    },
  ],
});
test("ownership lookup rejects guessed submission IDs", async () => {
  await assert.rejects(
    authorizeDocument(id, otherOwner, database),
    (e: any) => e instanceof AppError && e.status === 404,
  );
  await authorizeDocument(id, owner, database);
});
test("saving persists complete pages, references, version and prior snapshot", async () => {
  const d = await body();
  d.title = "Materi phishing";
  d.pages = [textPage(), textPage()];
  d.references = [
    {
      id: randomUUID(),
      title: "OWASP",
      url: "https://owasp.org",
      publisher: "OWASP",
      accessed_at: "2026-11-14",
    },
  ];
  const r = await saveDocument(id, d, owner, undefined, false, database);
  assert.equal(r.version, 2);
  const saved = await getDocument(id, database);
  assert.equal(saved.pages.length, 2);
  assert.equal(saved.references[0].url, "https://owasp.org");
  assert.equal(saved.name, "Test Writer");
  const rev = await pg.query<any>(
    "SELECT snapshot FROM submission_revisions WHERE submission_id=$1",
    [id],
  );
  assert.equal(rev.rows.length, 1);
  assert.equal(rev.rows[0].snapshot.pages.length, 1);
});
test("outdated save rolls back without replacing current pages", async () => {
  const d = await body();
  const ids = d.pages.map((p) => p.id);
  d.version = 1;
  d.pages = [textPage()];
  await assert.rejects(
    saveDocument(id, d, owner, undefined, false, database),
    (e: any) => e.status === 409,
  );
  assert.deepEqual(
    (await body()).pages.map((p) => p.id),
    ids,
  );
});
test("server page limit is enforced transactionally", async () => {
  const d = await body();
  d.pages.push(textPage());
  await assert.rejects(
    saveDocument(id, d, owner, undefined, false, database),
    (e: any) => e.status === 400,
  );
  assert.equal((await body()).pages.length, 2);
});
test("closed sessions reject writes while admin edits still work", async () => {
  await pg.query("UPDATE writing_sessions SET status='closed' WHERE id=$1", [
    session,
  ]);
  const d = await body();
  await assert.rejects(
    saveDocument(id, d, owner, undefined, false, database),
    (e: any) => e.status === 403,
  );
  d.title = "Koreksi pengurus";
  await saveDocument(id, d, undefined, "test-admin", false, database);
  assert.equal((await body()).title, "Koreksi pengurus");
  await pg.query("UPDATE writing_sessions SET status='open' WHERE id=$1", [
    session,
  ]);
});
test("submit atomically stores latest content and locks subsequent writer changes", async () => {
  const d = await body();
  d.pages[0].title = "Versi final";
  const r = await saveDocument(id, d, owner, undefined, true, database);
  assert.equal(r.status, "submitted");
  const final = await getDocument(id, database);
  assert.equal(final.pages[0].title, "Versi final");
  assert.equal(final.writable, false);
  await assert.rejects(
    saveDocument(id, await body(), owner, undefined, false, database),
    (e: any) => e.status === 403,
  );
});
test("retrying the same submit is idempotent after successful commit", async () => {
  const d = await body();
  const r = await saveDocument(id, d, owner, undefined, true, database);
  assert.equal(r.status, "submitted");
  assert.equal(r.version, d.version);
});
test("explicit revision reopens editable content while session remains open", async () => {
  await pg.query("UPDATE submissions SET status='revision' WHERE id=$1", [id]);
  const d = await body();
  d.title = "Revisi final";
  await saveDocument(id, d, owner, undefined, false, database);
  assert.equal((await getDocument(id, database)).writable, true);
});
test("expired deadline rejects write even when stored status remains open", async () => {
  await pg.query(
    "UPDATE writing_sessions SET start_at=now()-interval '2 days',end_at=now()-interval '1 day' WHERE id=$1",
    [session],
  );
  await assert.rejects(
    saveDocument(id, await body(), owner, undefined, false, database),
    (e: any) => e.status === 403,
  );
});
test("database protects writers and retains sessions with contributions", async () => {
  await assert.rejects(
    pg.query("DELETE FROM writing_sessions WHERE id=$1", [session]),
  );
  assert.equal((await body()).title, "Revisi final");
});
