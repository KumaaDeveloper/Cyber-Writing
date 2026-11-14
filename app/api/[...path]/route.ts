import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import sharp from "sharp";
import { db, rows, sql } from "@/lib/db";
import {
  AppError,
  fail,
  owner,
  admin,
  setAdminSession,
  logout,
  checkOrigin,
  limit,
  clientIP,
  audit,
  readJson,
} from "@/lib/security";
import {
  identitySchema,
  sessionSchema,
  documentSchema,
  sessionOpen,
} from "@/lib/model";
import {
  authorizeDocument,
  getDocument,
  saveDocument,
  lockDocument,
} from "@/lib/documents";
import { reviewDocument } from "@/lib/ai";
import { queueAssetDeletion, cleanDeletedAssets } from "@/lib/assets";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const uuid = (value: string) => z.uuid().parse(value);
const json = (v: unknown, status = 200) =>
  NextResponse.json(v, { status, headers: { "Cache-Control": "no-store" } });
async function handler(
  req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    checkOrigin(req);
    const { path } = await context.params;
    const [area, id, action] = path;
    const method = req.method;
    if (area === "public" && method === "GET") {
      if (!process.env.DATABASE_URL)
        return json({ session: null, configured: false });
      const [s] = await rows(
        sql`SELECT * FROM writing_sessions WHERE status<>'closed' AND start_at<=now() AND end_at>now() ORDER BY start_at LIMIT 1`,
      );
      const [setting] = await rows(
        sql`SELECT value FROM settings WHERE key='nim_pattern'`,
      );
      return json({
        configured: true,
        nim_pattern: setting?.value,
        session: s
          ? {
              ...s,
              themes: await rows(
                sql`SELECT * FROM session_themes WHERE session_id=${s.id} ORDER BY display_order`,
              ),
            }
          : null,
      });
    }
    if (area === "auth") {
      if (method === "GET") return json({ admin: await admin() });
      if (id === "logout" && method === "POST") {
        await logout();
        return json({ ok: true });
      }
      if (id === "login" && method === "POST") {
        await limit("login:" + clientIP(req), 10, 900);
        const body = z
          .object({
            username: z.string().min(1).max(100),
            password: z.string().min(1).max(200),
          })
          .parse(await readJson(req));
        if (Buffer.byteLength(body.password, "utf8") > 72)
          fail(401, "Username atau kata sandi salah.");
        const [a] = await rows(
          sql`SELECT * FROM admins WHERE username=${body.username}`,
        );
        const fallback =
          "$2b$12$JkxykcXKAF7W9y/Lz5gUceWVf3NQYnTRf7Nc4e7LH7hAKUZOaV7rG";
        const valid = await bcrypt.compare(
          body.password,
          a?.password_hash || fallback,
        );
        if (!a || !valid) fail(401, "Username atau kata sandi salah.");
        await setAdminSession(a.id);
        return json({ ok: true });
      }
    }
    if (area === "drafts") {
      const ownerHash = await owner(method === "POST" && !id);
      if (method === "GET" && !id) {
        return json({
          drafts: await rows(
            sql`SELECT s.id,s.title,s.status,s.updated_at,ws.title AS session_title FROM submissions s JOIN writing_sessions ws ON ws.id=s.session_id WHERE owner_hash=${ownerHash} ORDER BY s.updated_at DESC LIMIT 30`,
          ),
        });
      }
      if (method === "POST" && !id) {
        await limit("draft:" + ownerHash, 12, 3600);
        await limit("draft-ip:" + clientIP(req), 30, 3600);
        const b = z
          .object({
            identity: identitySchema,
            session_id: z.uuid(),
            theme_id: z.uuid(),
          })
          .parse(await readJson(req));
        const result = await db().transaction(async (tx) => {
          const [s] = await rows(
            sql`SELECT * FROM writing_sessions WHERE id=${b.session_id} FOR SHARE`,
            tx,
          );
          if (!s || !sessionOpen(s as any)) fail(403, "Sesi tidak tersedia.");
          const [theme] = await rows(
            sql`SELECT id FROM session_themes WHERE id=${b.theme_id} AND session_id=${s.id} AND available`,
            tx,
          );
          if (!theme) fail(400, "Tema tidak tersedia.");
          await rows(
            sql`SELECT pg_advisory_xact_lock(hashtext(${ownerHash}))`,
            tx,
          );
          const [existing] = await rows(
            sql`SELECT id FROM submissions WHERE owner_hash=${ownerHash} AND session_id=${s.id}`,
            tx,
          );
          if (existing) return existing;
          const [pattern] = await rows(
            sql`SELECT value FROM settings WHERE key='nim_pattern'`,
            tx,
          );
          if (pattern && !new RegExp(pattern.value).test(b.identity.nim))
            fail(400, "NIM tidak sesuai aturan sesi.");
          const w = b.identity;
          const [writer] = await rows(
            sql`INSERT INTO writers(name,nim,email,membership_status,department) VALUES(${w.name},${w.nim},${w.email},${w.membership_status},${w.membership_status === "pengurus" ? w.department : null}) RETURNING id`,
            tx,
          );
          const [draft] = await rows(
            sql`INSERT INTO submissions(session_id,theme_id,writer_id,owner_hash) VALUES(${s.id},${theme.id},${writer.id},${ownerHash}) RETURNING id`,
            tx,
          );
          await rows(
            sql`INSERT INTO submission_pages(id,submission_id,page_number,title) VALUES(${randomUUID()},${draft.id},1,'Halaman pertama')`,
            tx,
          );
          return draft;
        });
        return json(result, 201);
      }
      uuid(id);
      await authorizeDocument(id, ownerHash);
      if (method === "GET") return json(await getDocument(id));
      if (method === "PUT" || (method === "POST" && action === "submit")) {
        await limit("save:" + ownerHash, 240, 60);
        return json(
          await saveDocument(
            id,
            documentSchema.parse(await readJson(req)),
            ownerHash,
            undefined,
            action === "submit",
          ),
        );
      }
      if (method === "DELETE") {
        await db().transaction(async (tx) => {
          const { s } = await lockDocument(id, tx, ownerHash);
          await queueAssetDeletion(id, tx);
          await rows(sql`DELETE FROM submissions WHERE id=${id}`, tx);
          await rows(sql`DELETE FROM writers WHERE id=${s.writer_id}`, tx);
        });
        await cleanDeletedAssets().catch(() => {});
        return json({ ok: true });
      }
    }
    if (area === "upload" && method === "POST") {
      // Authorize and reserve asset quota under the same row lock as writer edits.
      const id = uuid(new URL(req.url).searchParams.get("id") || "");
      let adminId: string | undefined, ownerHash: string | undefined;
      if (new URL(req.url).searchParams.get("admin") === "1")
        adminId = (await admin()).id;
      else ownerHash = await owner();
      await limit("upload:" + (adminId || ownerHash), 40, 3600);
      if (
        !process.env.CLOUDINARY_API_SECRET ||
        !process.env.CLOUDINARY_CLOUD_NAME ||
        !process.env.CLOUDINARY_API_KEY
      )
        fail(503, "Penyimpanan gambar belum dikonfigurasi.");
      if (Number(req.headers.get("content-length") || 0) > 4300000)
        fail(413, "Ukuran gambar maksimal 4 MB.");
      const form = await req.formData();
      const file = form.get("file");
      if (
        !(file instanceof File) ||
        file.size > 4 * 1024 * 1024 ||
        !["image/png", "image/jpeg", "image/webp"].includes(file.type)
      )
        fail(400, "Gunakan JPG, PNG, atau WebP maksimal 4 MB.");
      const input = Buffer.from(await (file as File).arrayBuffer());
      const metadata = await sharp(input, {
        limitInputPixels: 25000000,
      }).metadata();
      if (!["png", "jpeg", "webp"].includes(metadata.format || ""))
        fail(400, "Isi file bukan gambar yang didukung.");
      const buffer = await sharp(input, { limitInputPixels: 25000000 })
        .rotate()
        .resize({
          width: 2400,
          height: 2400,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer();
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
      });
      const assetId = randomUUID(),
        storageKey = `cyber-writing/${id}/${assetId}`;
      await db().transaction(async (tx) => {
        await lockDocument(id, tx, ownerHash);
        const [r] = await rows(
          sql`SELECT count(*)::int AS n FROM uploaded_assets WHERE submission_id=${id}`,
          tx,
        );
        if (r.n >= 60) fail(400, "Batas 60 unggahan per tulisan tercapai.");
        await rows(
          sql`INSERT INTO uploaded_assets(id,submission_id,public_url,storage_key,mime_type,file_size) VALUES(${assetId},${id},'',${storageKey},'image/webp',${buffer.length})`,
          tx,
        );
      });
      try {
        const uploaded = await new Promise<any>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { public_id: storageKey, resource_type: "image", overwrite: false },
            (err, result) => (err ? reject(err) : resolve(result)),
          );
          stream.end(buffer);
        });
        await db().transaction(async (tx) => {
          await lockDocument(id, tx, ownerHash);
          await rows(
            sql`UPDATE uploaded_assets SET public_url=${uploaded.secure_url} WHERE id=${assetId}`,
            tx,
          );
        });
        return json({ url: uploaded.secure_url });
      } catch (e) {
        await cloudinary.uploader.destroy(storageKey).catch(() => {});
        await rows(sql`DELETE FROM uploaded_assets WHERE id=${assetId}`);
        throw e;
      }
    }
    if (area === "admin") {
      const a = await admin();
      const resource = id;
      const target = action;
      const sub = path[3];
      if (resource === "dashboard" && method === "GET") {
        const [stats] = await rows(
          sql`SELECT (SELECT count(*)::int FROM writing_sessions) AS sessions,(SELECT count(*)::int FROM writing_sessions WHERE status<>'closed' AND start_at<=now() AND end_at>now()) AS active,(SELECT count(DISTINCT nim)::int FROM writers) AS writers,count(*)::int AS submissions,count(*) FILTER(WHERE status='draft')::int AS drafts,count(*) FILTER(WHERE status='submitted')::int AS submitted,count(*) FILTER(WHERE is_starred)::int AS starred,(SELECT count(DISTINCT submission_id)::int FROM ai_reviews) AS reviewed FROM submissions`,
        );
        return json(stats);
      }
      if (resource === "sessions") {
        if (method === "GET") {
          const all = await rows(
            sql`SELECT ws.*,(SELECT count(*)::int FROM submissions s WHERE s.session_id=ws.id) AS count FROM writing_sessions ws ORDER BY start_at DESC`,
          );
          for (const s of all)
            s.themes = await rows(
              sql`SELECT * FROM session_themes WHERE session_id=${s.id} ORDER BY display_order`,
            );
          return json(all);
        }
        if (method === "POST" || method === "PUT") {
          const b = sessionSchema.parse(await readJson(req));
          const sid = target ? uuid(target) : randomUUID();
          await db().transaction(async (tx) => {
            await rows(sql`SELECT pg_advisory_xact_lock(940163)`, tx);
            if (target) {
              const [current] = await rows(
                sql`SELECT id FROM writing_sessions WHERE id=${sid} FOR UPDATE`,
                tx,
              );
              if (!current) fail(404, "Sesi tidak ditemukan.");
            }
            if (b.status !== "closed") {
              const conflicts = await rows(
                sql`SELECT id FROM writing_sessions WHERE id<>${sid} AND status<>'closed' AND start_at<${b.end_at}::timestamptz AND end_at>${b.start_at}::timestamptz`,
                tx,
              );
              if (conflicts.length)
                fail(
                  409,
                  "Jadwal bertabrakan dengan sesi lain. Tutup sesi tersebut atau ubah jadwal.",
                );
            }
            if (target) {
              const [max] = await rows(
                sql`SELECT coalesce(max(n),0)::int AS n FROM (SELECT count(*) AS n FROM submission_pages p JOIN submissions s ON s.id=p.submission_id WHERE s.session_id=${sid} GROUP BY s.id) x`,
                tx,
              );
              if (max.n > b.max_pages)
                fail(
                  400,
                  "Batas halaman lebih kecil daripada tulisan yang sudah ada.",
                );
            }
            await rows(
              sql`INSERT INTO writing_sessions(id,title,description,start_at,end_at,max_pages,status) VALUES(${sid},${b.title},${b.description},${b.start_at},${b.end_at},${b.max_pages},${b.status}) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,start_at=excluded.start_at,end_at=excluded.end_at,max_pages=excluded.max_pages,status=excluded.status,updated_at=now()`,
              tx,
            );
            const old = await rows(
              sql`SELECT id FROM session_themes WHERE session_id=${sid}`,
              tx,
            );
            for (const t of b.themes)
              if (t.id && !old.some((x) => x.id === t.id))
                fail(400, "Tema tidak berasal dari sesi ini.");
            for (const t of old)
              if (!b.themes.some((x) => x.id === t.id)) {
                const refs = await rows(
                  sql`SELECT id FROM submissions WHERE theme_id=${t.id} LIMIT 1`,
                  tx,
                );
                if (refs.length)
                  fail(
                    400,
                    "Tema sudah digunakan. Nonaktifkan tema tanpa menghapusnya.",
                  );
                await rows(
                  sql`DELETE FROM session_themes WHERE id=${t.id}`,
                  tx,
                );
              }
            // Update retained themes in place; slots stay stable in the session form.
            for (let i = 0; i < b.themes.length; i++) {
              const t = b.themes[i];
              await rows(
                sql`INSERT INTO session_themes(id,session_id,title,description,instructions,available,display_order) VALUES(${t.id || randomUUID()},${sid},${t.title},${t.description},${t.instructions},${t.available},${i}) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,instructions=excluded.instructions,available=excluded.available,display_order=excluded.display_order`,
                tx,
              );
            }
            await audit(
              a.id,
              target ? "session.update" : "session.create",
              sid,
              tx,
            );
          });
          return json({ id: sid });
        }
        if (method === "DELETE") {
          uuid(target);
          await db().transaction(async (tx) => {
            await rows(
              sql`SELECT id FROM writing_sessions WHERE id=${target} FOR UPDATE`,
              tx,
            );
            const used = await rows(
              sql`SELECT id FROM submissions WHERE session_id=${target} LIMIT 1`,
              tx,
            );
            if (used.length)
              fail(
                409,
                "Sesi berisi tulisan tidak dapat dihapus. Gunakan Tutup Sesi.",
              );
            await rows(
              sql`DELETE FROM writing_sessions WHERE id=${target}`,
              tx,
            );
            await audit(a.id, "session.delete", target, tx);
          });
          return json({ ok: true });
        }
      }
      if (resource === "submissions") {
        if (!target && method === "GET") {
          const u = new URL(req.url),
            q = (u.searchParams.get("q") || "").slice(0, 100),
            session = u.searchParams.get("session") || "",
            status = u.searchParams.get("status") || "",
            theme = u.searchParams.get("theme") || "",
            star = u.searchParams.get("star") === "1",
            ai = u.searchParams.get("ai") === "1";
          const page = Math.max(
            1,
            Math.min(100000, Number(u.searchParams.get("page")) || 1),
          );
          const where = sql`(${q}='' OR w.name ILIKE ${"%" + q + "%"} OR w.nim ILIKE ${"%" + q + "%"}) AND (${session}='' OR s.session_id::text=${session}) AND (${status}='' OR s.status=${status}) AND (${theme}='' OR t.title=${theme}) AND (NOT ${star} OR s.is_starred) AND (NOT ${ai} OR r.id IS NOT NULL)`;
          const data = await rows(
            sql`SELECT s.id,s.title,s.status,s.is_starred,s.updated_at,s.content_version,w.name,w.nim,w.membership_status,w.department,t.title AS theme_title,ws.title AS session_title,r.status AS ai_status,r.content_version AS ai_version,(SELECT count(*)::int FROM submission_pages p WHERE p.submission_id=s.id) AS pages,count(*) OVER()::int AS total FROM submissions s JOIN writers w ON w.id=s.writer_id JOIN session_themes t ON t.id=s.theme_id JOIN writing_sessions ws ON ws.id=s.session_id LEFT JOIN LATERAL (SELECT id,status,content_version FROM ai_reviews WHERE submission_id=s.id ORDER BY checked_at DESC LIMIT 1) r ON true WHERE ${where} ORDER BY s.updated_at DESC LIMIT 15 OFFSET ${(page - 1) * 15}`,
          );
          return json({ items: data, total: data[0]?.total || 0, page });
        }
        uuid(target);
        if (method === "GET") {
          if (sub === "history")
            return json(
              await rows(
                sql`SELECT id,content_version,actor,created_at FROM submission_revisions WHERE submission_id=${target} ORDER BY created_at DESC LIMIT 50`,
              ),
            );
          return json({
            ...(await getDocument(target)),
            reviews: await rows(
              sql`SELECT * FROM ai_reviews WHERE submission_id=${target} ORDER BY checked_at DESC LIMIT 10`,
            ),
          });
        }
        if (method === "PUT")
          return json(
            await saveDocument(
              target,
              documentSchema.parse(await readJson(req)),
              undefined,
              a.id,
            ),
          );
        if (method === "PATCH") {
          const b = z
            .object({
              is_starred: z.boolean().optional(),
              status: z
                .enum(["draft", "submitted", "revision", "reviewed"])
                .optional(),
            })
            .parse(await readJson(req));
          await db().transaction(async (tx) => {
            await lockDocument(target, tx);
            if (b.is_starred !== undefined)
              await rows(
                sql`UPDATE submissions SET is_starred=${b.is_starred} WHERE id=${target}`,
                tx,
              );
            if (b.status)
              await rows(
                sql`UPDATE submissions SET status=${b.status},updated_at=now() WHERE id=${target}`,
                tx,
              );
            await audit(a.id, "submission.status", target, tx);
          });
          return json({ ok: true });
        }
        if (method === "POST" && sub === "notes") {
          const b = z
            .object({
              note: z.string().trim().min(1).max(5000),
              page_id: z.uuid().nullable(),
            })
            .parse(await readJson(req));
          await getDocument(target);
          if (b.page_id) {
            const p = await rows(
              sql`SELECT id FROM submission_pages WHERE id=${b.page_id} AND submission_id=${target}`,
            );
            if (!p.length) fail(400, "Halaman tidak valid.");
          }
          await rows(
            sql`INSERT INTO admin_notes(submission_id,admin_id,page_id,note) VALUES(${target},${a.id},${b.page_id},${b.note})`,
          );
          await audit(a.id, "submission.note", target);
          return json({ ok: true });
        }
        if (method === "POST" && sub === "review") {
          const doc = await getDocument(target);
          const b = z
            .object({ force: z.boolean().optional() })
            .parse(await readJson(req));
          const [cached] = await rows(
            sql`SELECT * FROM ai_reviews WHERE submission_id=${target} AND content_version=${doc.version} ORDER BY checked_at DESC LIMIT 1`,
          );
          if (cached && !b.force) return json(cached);
          await limit("ai:" + a.id, 20, 3600);
          await limit("ai-doc:" + target, 1, 120);
          const result = await reviewDocument(doc);
          const [r] = await rows(
            sql`INSERT INTO ai_reviews(submission_id,content_version,status,summary,findings_json,sources_json,search_html,model_name) VALUES(${target},${doc.version},${result.status},${result.summary},${JSON.stringify(result.findings)}::jsonb,${JSON.stringify(result.sources)}::jsonb,${result.search_html},${result.model}) RETURNING *`,
          );
          await audit(a.id, "submission.review", target);
          return json(r);
        }
        if (method === "DELETE") {
          await db().transaction(async (tx) => {
            const { s } = await lockDocument(target, tx);
            await queueAssetDeletion(target, tx);
            await rows(sql`DELETE FROM submissions WHERE id=${target}`, tx);
            await rows(sql`DELETE FROM writers WHERE id=${s.writer_id}`, tx);
            await audit(a.id, "submission.delete", target, tx);
          });
          await cleanDeletedAssets().catch(() => {});
          return json({ ok: true });
        }
      }
      if (resource === "settings") {
        if (method === "GET")
          return json({
            username: a.username,
            settings: await rows(sql`SELECT * FROM settings`),
            integrations: {
              database: !!process.env.DATABASE_URL,
              gemini: !!process.env.GEMINI_API_KEY,
              images: !!(
                process.env.CLOUDINARY_API_SECRET &&
                process.env.CLOUDINARY_CLOUD_NAME &&
                process.env.CLOUDINARY_API_KEY
              ),
            },
            audit: await rows(
              sql`SELECT action,target_id,created_at FROM audit_log ORDER BY created_at DESC LIMIT 30`,
            ),
          });
        if (method === "PUT") {
          const b = z
            .object({
              currentPassword: z.string().max(200),
              newPassword: z.string().min(12).max(200),
            })
            .parse(await readJson(req));
          if (Buffer.byteLength(b.newPassword, "utf8") > 72)
            fail(400, "Kata sandi maksimal 72 byte UTF-8.");
          await limit("password:" + a.id, 5, 900);
          const [record] = await rows(
            sql`SELECT password_hash FROM admins WHERE id=${a.id}`,
          );
          if (!(await bcrypt.compare(b.currentPassword, record.password_hash)))
            fail(400, "Kata sandi saat ini salah.");
          await db().transaction(async (tx) => {
            await rows(
              sql`UPDATE admins SET password_hash=${await bcrypt.hash(b.newPassword, 12)} WHERE id=${a.id}`,
              tx,
            );
            await rows(
              sql`DELETE FROM admin_sessions WHERE admin_id=${a.id}`,
              tx,
            );
            await audit(a.id, "admin.password", a.id, tx);
          });
          await setAdminSession(a.id);
          return json({ ok: true });
        }
        if (method === "PATCH") {
          // Constrain configurable NIM rules to numeric length bounds; no arbitrary regex/ReDoS.
          const b = z
            .object({
              min: z.number().int().min(5).max(20),
              max: z.number().int().min(5).max(20),
            })
            .refine((v) => v.max >= v.min)
            .parse(await readJson(req));
          await rows(
            sql`UPDATE settings SET value=${`^[0-9]{${b.min},${b.max}}$`} WHERE key='nim_pattern'`,
          );
          return json({ ok: true });
        }
      }
    }
    return json({ error: "Endpoint tidak ditemukan." }, 404);
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError)
      return json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    if (e instanceof Error && e.message === "CONFIG_DATABASE")
      return json(
        {
          error:
            "Database belum dikonfigurasi. Isi DATABASE_URL dan jalankan migrasi.",
        },
        503,
      );
    console.error("[api]", e instanceof Error ? e.name : "Unknown error");
    return json(
      {
        error:
          "Permintaan gagal diproses. Periksa konfigurasi layanan atau coba kembali.",
      },
      500,
    );
  }
}
export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
};
