import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrateDatabase, type SetupClient } from "../scripts/database-setup";
import { createDraft, writerAccess, cooldownState } from "../lib/writers";
import { getDocument, saveDocument } from "../lib/documents";
import type { DB } from "../lib/db";
import type { Identity, DocumentData } from "../lib/model";
const pg = new PGlite();
const database = drizzle(pg) as unknown as DB;
const client: SetupClient = {
  async query(text, values) {
    if (!values && text.split(";").filter((x) => x.trim()).length > 1)
      return (await pg.exec(text)).at(-1)!;
    return pg.query(text, values);
  },
};
const identity: Identity = {
  name: "Test Writer",
  nim: "0012345678",
  email: "qa@example.com",
  membership_status: "anggota",
  department: null,
};
const owner = "browser-one";
let sessionId: string, themeId: string, firstId: string, secondId: string;
before(async () => {
  await migrateDatabase(client);
  sessionId = (
    await pg.query<{ id: string }>(
      "INSERT INTO writing_sessions(title,start_at,end_at,max_pages,status) VALUES('Sesi uji',now()-interval '1 day',now()+interval '7 days',8,'open') RETURNING id",
    )
  ).rows[0].id;
  themeId = (
    await pg.query<{ id: string }>(
      "INSERT INTO session_themes(session_id,title,display_order) VALUES($1,$2,0) RETURNING id",
      [sessionId, "Keamanan digital"],
    )
  ).rows[0].id;
});
after(() => pg.close());
async function content(id: string): Promise<DocumentData> {
  const d = await getDocument(id, database);
  return {
    title: "Tulisan uji",
    version: d.version,
    references: [],
    pages: d.pages.map((p) => ({
      ...p,
      blocks: [
        {
          id: crypto.randomUUID(),
          type: "text" as const,
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Periksa sumber pesan sebelum membuka tautan.",
                  },
                ],
              },
            ],
          },
        },
      ],
    })),
  };
}
test("cooldown lasts exactly 24 hours and can be disabled", () => {
  const last = "2026-11-15T00:00:00Z";
  assert.equal(
    cooldownState(last, 24, new Date("2026-11-15T23:59:59Z")).locked,
    true,
  );
  assert.equal(
    cooldownState(last, 24, new Date("2026-11-16T00:00:00Z")).locked,
    false,
  );
  assert.equal(cooldownState(last, 0, new Date(last)).locked, false);
});
test("repeated draft creation reuses the active draft and submit locks writer and NIM", async () => {
  firstId = (await createDraft(identity, sessionId, themeId, owner, database))
    .id;
  assert.equal(
    (await createDraft(identity, sessionId, themeId, owner, database)).id,
    firstId,
  );
  await saveDocument(
    firstId,
    await content(firstId),
    owner,
    undefined,
    true,
    database,
  );
  const access = await writerAccess(owner, identity.nim, database);
  assert.equal(access.locked, true);
  assert.equal(access.cooldown_hours, 24);
  const d = await getDocument(firstId, database);
  assert.equal(d.status, "submitted");
  assert.equal(d.writable, false);
  assert.ok(d.pages.length);
  assert.equal("owner_hash" in d, false);
  await assert.rejects(
    createDraft(identity, sessionId, themeId, owner, database),
    (e: any) => e.status === 423,
  );
  await assert.rejects(
    createDraft(identity, sessionId, themeId, "another-browser", database),
    (e: any) => e.status === 423,
  );
  await assert.rejects(
    createDraft(
      { ...identity, nim: "0099999999" },
      sessionId,
      themeId,
      owner,
      database,
    ),
    (e: any) => e.status === 423,
  );
});
test("after cooldown a new draft in the same session is allowed while old article stays read-only", async () => {
  await pg.exec(
    "UPDATE writer_cooldowns SET last_submitted_at=now()-interval '25 hours'",
  );
  secondId = (await createDraft(identity, sessionId, themeId, owner, database))
    .id;
  assert.notEqual(secondId, firstId);
  assert.equal((await getDocument(firstId, database)).writable, false);
  assert.equal((await getDocument(secondId, database)).writable, true);
  assert.equal(
    (await createDraft(identity, sessionId, themeId, owner, database)).id,
    secondId,
  );
  assert.equal(
    (await pg.query("SELECT id FROM submissions WHERE owner_hash=$1", [owner]))
      .rows.length,
    2,
  );
});
test("admin cooldown changes apply immediately and deleting a submission does not remove the lock", async () => {
  await saveDocument(
    secondId,
    await content(secondId),
    owner,
    undefined,
    true,
    database,
  );
  assert.equal(
    (await writerAccess(owner, identity.nim, database)).locked,
    true,
  );
  await pg.exec(
    "UPDATE settings SET value='0' WHERE key='writer_cooldown_hours'",
  );
  assert.equal(
    (await writerAccess(owner, identity.nim, database)).locked,
    false,
  );
  const third = (
    await createDraft(identity, sessionId, themeId, owner, database)
  ).id;
  assert.notEqual(third, secondId);
  await pg.exec(
    "UPDATE settings SET value='24' WHERE key='writer_cooldown_hours'",
  );
  const draft = await getDocument(third, database);
  assert.equal(draft.writable, false);
  assert.equal(draft.read_only_reason, "cooldown");
  await assert.rejects(
    saveDocument(
      third,
      await content(third),
      owner,
      undefined,
      false,
      database,
    ),
    (e: any) => e.status === 423,
  );
  await pg.query("DELETE FROM submissions WHERE id=$1", [secondId]);
  assert.equal(
    (await writerAccess(owner, identity.nim, database)).locked,
    true,
  );
});
test('migration backfills cooldown from an article submitted before this update',async()=>{
 const {readFile}=await import('node:fs/promises');
 const legacy=new PGlite();
 try {
  await legacy.exec(await readFile('db/001_initial.sql','utf8'));
  const session=(await legacy.query<{id:string}>("INSERT INTO writing_sessions(title,start_at,end_at,max_pages,status) VALUES('Legacy',now()-interval '1 day',now()+interval '1 day',8,'open') RETURNING id")).rows[0].id;
  const theme=(await legacy.query<{id:string}>("INSERT INTO session_themes(session_id,title,display_order) VALUES($1,'Legacy theme',0) RETURNING id",[session])).rows[0].id;
  const writer=(await legacy.query<{id:string}>("INSERT INTO writers(name,nim,email,membership_status) VALUES('Legacy Writer','0011111111','legacy@example.com','anggota') RETURNING id")).rows[0].id;
  await legacy.query("INSERT INTO submissions(session_id,theme_id,writer_id,owner_hash,status,submitted_at) VALUES($1,$2,$3,'legacy-owner','submitted',now()-interval '1 hour')",[session,theme,writer]);
  await legacy.exec(await readFile('db/003_writer_cooldown.sql','utf8'));
  const e=drizzle(legacy) as unknown as DB;
  assert.equal((await writerAccess('legacy-owner',undefined,e)).locked,true);
  assert.equal((await writerAccess('new-browser','0011111111',e)).locked,true);
  assert.equal((await legacy.query('SELECT * FROM submissions')).rows.length,1);
 }finally {await legacy.close();}
});
