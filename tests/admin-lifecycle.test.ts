import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrateDatabase, type SetupClient } from "../scripts/database-setup";
import { cleanupExpiredDrafts } from "../lib/maintenance";
import { getDocument, saveDocument, writeContent } from "../lib/documents";
import { changeSessionStatus, removeOrCloseSession } from "../lib/sessions";
import { draftExpired, DRAFT_TTL_MS } from "../lib/draft-expiry";
import { wibDateToISO } from "../lib/session-dates";
import { sessionSchema } from "../lib/model";
import type { DB } from "../lib/db";
const pg = new PGlite();
const database = drizzle(pg) as unknown as DB;
const client: SetupClient = { async query(text, values) {
  if (!values && text.split(";").filter((v) => v.trim()).length > 1) return (await pg.exec(text)).at(-1)!;
  return pg.query(text, values);
} };
let adminId: string;
before(async () => {
  await migrateDatabase(client);
  adminId = (await pg.query<{ id: string }>("INSERT INTO admins(username,password_hash) VALUES('admin-test','fixture') RETURNING id")).rows[0].id;
});
after(() => pg.close());
async function session() {
  return (await pg.query<{id:string}>("INSERT INTO writing_sessions(title,start_at,end_at,max_pages,status) VALUES('Sesi uji',now()-interval '2 days',now()+interval '2 days',8,'open') RETURNING id")).rows[0].id;
}
async function draft(sessionId: string, status = "draft", hours = 0) {
  const existingTheme = (await pg.query<{id:string}>("SELECT id FROM session_themes WHERE session_id=$1 LIMIT 1", [sessionId])).rows[0];
  const theme = existingTheme?.id || (await pg.query<{id:string}>("INSERT INTO session_themes(session_id,title,display_order) VALUES($1,'Tema',0) RETURNING id", [sessionId])).rows[0].id;
  const writer = (await pg.query<{id:string}>("INSERT INTO writers(name,nim,email,membership_status) VALUES('Peserta','123456','test@example.com','anggota') RETURNING id")).rows[0].id;
  const id = (await pg.query<{id:string}>("INSERT INTO submissions(session_id,theme_id,writer_id,owner_hash,status) VALUES($1,$2,$3,'owner',$4) RETURNING id", [sessionId,theme,writer,status])).rows[0].id;
  await writeContent(id, { title: "Judul", version: 1, references: [], pages: [{ id: randomUUID(), title: "Halaman", blocks: [{ id: randomUUID(), type: "text", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Materi" }] }] } }] }] }, database);
  await pg.query("UPDATE submissions SET updated_at=now()-$2*interval '1 hour' WHERE id=$1", [id,hours]);
  return { id, writer };
}
test("closing and deleting a session does not require resubmitting ISO dates", async () => {
  const empty = await session();
  await changeSessionStatus(empty, "closed", adminId, database);
  assert.equal((await pg.query<{status:string}>("SELECT status FROM writing_sessions WHERE id=$1",[empty])).rows[0].status,"closed");
  assert.deepEqual(await removeOrCloseSession(empty,adminId,database),{deleted:true,closed:false});
  assert.equal((await pg.query("SELECT 1 FROM writing_sessions WHERE id=$1",[empty])).rows.length,0);
  const used = await session(), submission = await draft(used,"submitted",30);
  assert.deepEqual(await removeOrCloseSession(used,adminId,database),{deleted:false,closed:true});
  assert.equal((await getDocument(submission.id,database)).status,"submitted");
  await assert.rejects(removeOrCloseSession(randomUUID(),adminId,database),(e:any)=>e.status===404);
});
test("opening a closed session uses server time and still rejects overlapping sessions", async () => {
  await pg.query("UPDATE writing_sessions SET status='closed'");
  const first=await session(), second=await session();
  await changeSessionStatus(second,"closed",adminId,database);
  await assert.rejects(changeSessionStatus(second,"open",adminId,database),(e:any)=>e.status===409);
  await changeSessionStatus(first,"closed",adminId,database);
  await changeSessionStatus(second,"open",adminId,database);
  const r=(await pg.query<{status:string;valid:boolean}>("SELECT status,end_at>start_at AS valid FROM writing_sessions WHERE id=$1",[second])).rows[0];
  assert.equal(r.status,"open");assert.equal(r.valid,true);
});
test("WIB inputs with or without seconds and PostgreSQL timestamps normalize safely", () => {
  assert.equal(wibDateToISO("2026-11-15T09:30"),"2026-11-15T02:30:00.000Z");
  assert.equal(wibDateToISO("2026-11-15T09:30:45"),"2026-11-15T02:30:45.000Z");
  const v=sessionSchema.parse({title:"Sesi",description:"",start_at:"2026-11-15 09:30:00+07",end_at:new Date("2026-11-16T02:30:00Z"),max_pages:2,status:"open",themes:[{title:"Tema",description:"",instructions:"",available:true}]});
  assert.equal(new Date(v.start_at).toISOString(),"2026-11-15T02:30:00.000Z");
  assert.throws(()=>wibDateToISO("invalid"));
});
test("expiry starts exactly at 24 hours and only affects drafts", () => {
  const now=new Date("2026-11-15T00:00:00Z"), updated_at=new Date(now.getTime()-DRAFT_TTL_MS);
  assert.equal(draftExpired({status:"draft",updated_at},now),true);
  assert.equal(draftExpired({status:"draft",updated_at:new Date(updated_at.getTime()+1)},now),false);
  for(const status of ["submitted","reviewed","revision"]) assert.equal(draftExpired({status,updated_at},now),false);
});
test("expired drafts cannot be read or revived by a writer or admin", async () => {
  const s=await session(), d=await draft(s);
  const doc=await getDocument(d.id,database);
  await pg.query("UPDATE submissions SET updated_at=now()-interval '24 hours' WHERE id=$1",[d.id]);
  await assert.rejects(getDocument(d.id,database),(e:any)=>e.status===410);
  await assert.rejects(saveDocument(d.id,doc,"owner",undefined,false,database),(e:any)=>e.status===410);
  await assert.rejects(saveDocument(d.id,doc,undefined,adminId,false,database),(e:any)=>e.status===410);
});
test("cleanup removes expired drafts, cascades private data, queues images, and retains submitted/recent documents", async () => {
  const s=await session(), old=await draft(s,"draft",25), recent=await draft(s,"draft",23), submitted=await draft(s,"submitted",30), revision=await draft(s,"revision",30);
  await pg.query("INSERT INTO uploaded_assets(submission_id,public_url,storage_key,mime_type,file_size) VALUES($1,'https://example.com/a.webp','expiry-fixture','image/webp',100)",[old.id]);
  await pg.query("INSERT INTO ai_reviews(submission_id,content_version,status,summary,findings_json,sources_json,model_name) VALUES($1,1,'VALID','Review','[]','[]','fixture')",[old.id]);
  const count=await cleanupExpiredDrafts(database);
  assert.ok(count>=1);
  assert.equal((await pg.query("SELECT 1 FROM submissions WHERE id=$1",[old.id])).rows.length,0);
  assert.equal((await pg.query("SELECT 1 FROM writers WHERE id=$1",[old.writer])).rows.length,0);
  for(const table of ["submission_pages","ai_reviews","uploaded_assets"]) assert.equal((await pg.query(`SELECT 1 FROM ${table} WHERE submission_id=$1`,[old.id])).rows.length,0);
  assert.equal((await pg.query("SELECT 1 FROM asset_deletion_jobs WHERE storage_key='expiry-fixture'")).rows.length,1);
  for(const d of [recent,submitted,revision]) await getDocument(d.id,database);
  assert.equal(await cleanupExpiredDrafts(database),0);
  const before=await getDocument(recent.id,database);
  const saved=await saveDocument(recent.id,before,"owner",undefined,false,database);
  assert.ok(new Date(saved.updated_at).getTime()>Date.now()-60000);
  assert.equal(draftExpired(await getDocument(recent.id,database) as any),false);
});
