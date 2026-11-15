import { createHash } from "node:crypto";
import { db, rows, sql, type DB, type Executor } from "./db";
import { getDocument } from "./documents";
import { reviewDocument } from "./ai";
import { DEFAULT_GEMINI_MODEL } from "./gemini-transport";
import { fail } from "./security";
import type { DocumentData, Page } from "./model";

type ReviewDoc = DocumentData & Record<string, any>;
type PageReview = {
  id: string; submission_id: string; page_id: string; page_number: number;
  content_hash: string; content_version: number; status: "VALID" | "KURANG VALID" | "TIDAK VALID";
  summary: string; findings_json: Awaited<ReturnType<typeof reviewDocument>>["findings"];
  sources_json: Awaited<ReturnType<typeof reviewDocument>>["sources"];
  search_html: string; model_name: string; checked_at: string;
};
export const reviewSummaryJoin = sql`LEFT JOIN LATERAL (
  SELECT max(id::text)::uuid AS id,min(content_version) AS content_version,
    CASE WHEN count(*)=0 THEN NULL
      WHEN count(*)<(SELECT count(*) FROM submission_pages WHERE submission_id=s.id) THEN 'BELUM LENGKAP'
      WHEN bool_or(status='TIDAK VALID') THEN 'TIDAK VALID'
      WHEN bool_or(status='KURANG VALID') THEN 'KURANG VALID' ELSE 'VALID' END AS status
  FROM (SELECT DISTINCT ON (page_id) id,status,content_version FROM ai_reviews
    WHERE submission_id=s.id AND page_id IN (SELECT id FROM submission_pages WHERE submission_id=s.id)
    ORDER BY page_id,content_version DESC,checked_at DESC,id DESC) latest
) r ON true`;
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
export function pageReviewHash(doc: ReviewDoc, page: Page) {
  return createHash("sha256").update(JSON.stringify(canonical({
    policy: "per-page-v1", title: doc.title, theme: doc.theme_title,
    page, references: doc.references,
    model: (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim().replace(/^models\//, ""),
    search: process.env.GEMINI_SEARCH_GROUNDING === "true",
  }))).digest("hex");
}
export async function listPageReviews(doc: ReviewDoc, executor: Executor = db()) {
  const reviews = await rows<PageReview>(sql`SELECT * FROM ai_reviews WHERE submission_id=${doc.id} AND page_id IS NOT NULL ORDER BY checked_at DESC,id DESC`, executor);
  return doc.pages.flatMap((page, index) => {
    const matching = reviews.filter((r) => r.page_id === page.id);
    const review = matching.find((r) => r.content_hash === pageReviewHash(doc, page)) || matching[0];
    return review ? [{ ...review, page_number: index + 1, page_title: page.title,
      findings_json: review.findings_json.map((finding: any) => ({ ...finding, page: index + 1 })),
      is_current: review.content_hash === pageReviewHash(doc, page),
    }] : [];
  });
}
export async function cachedPageReview(doc: ReviewDoc, pageId: string, executor: Executor = db()) {
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page) return fail(404, "Halaman tidak ditemukan.");
  const [cached] = await rows<PageReview>(sql`SELECT * FROM ai_reviews WHERE submission_id=${doc.id} AND page_id=${pageId} AND content_hash=${pageReviewHash(doc, page)}`, executor);
  return cached;
}
export async function checkPage(doc: ReviewDoc, pageId: string, options: {
  force?: boolean;
  database?: DB;
  review?: typeof reviewDocument;
} = {}) {
  const database = options.database || db();
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page) return fail(404, "Halaman tidak ditemukan.");
  const contentHash = pageReviewHash(doc, page);
  if (!options.force) {
    const cached = await cachedPageReview(doc, pageId, database);
    if (cached) {
      const [current] = await rows<PageReview>(sql`UPDATE ai_reviews SET content_version=${doc.version} WHERE id=${cached.id} RETURNING *`, database);
      return current;
    }
  }
  // Only the requested page is sent; the model uses page 1 locally.
  const result = await (options.review || reviewDocument)({
    title: doc.title, theme_title: doc.theme_title,
    pages: [page], references: doc.references,
  });
  return database.transaction(async (tx) => {
    await rows(sql`SELECT id FROM submissions WHERE id=${doc.id} FOR UPDATE`, tx);
    const current = await getDocument(doc.id, tx);
    const pageIndex = current.pages.findIndex((p) => p.id === pageId);
    if (pageIndex < 0 || pageReviewHash(current, current.pages[pageIndex]) !== contentHash)
      return fail(409, "Halaman berubah selama pemeriksaan. Simpan perubahan lalu cek AI lagi.");
    const findings = result.findings.map((finding) => ({ ...finding, page: pageIndex + 1 }));
    const [saved] = await rows<PageReview>(sql`INSERT INTO ai_reviews(submission_id,content_version,page_id,page_number,content_hash,status,summary,findings_json,sources_json,search_html,model_name)
      VALUES(${doc.id},${current.version},${pageId},${pageIndex + 1},${contentHash},${result.status},${result.summary},${JSON.stringify(findings)}::jsonb,${JSON.stringify(result.sources)}::jsonb,${result.search_html},${result.model})
      ON CONFLICT (submission_id,page_id,content_hash) DO UPDATE SET content_version=EXCLUDED.content_version,page_number=EXCLUDED.page_number,status=EXCLUDED.status,summary=EXCLUDED.summary,findings_json=EXCLUDED.findings_json,sources_json=EXCLUDED.sources_json,search_html=EXCLUDED.search_html,model_name=EXCLUDED.model_name,checked_at=now() RETURNING *`, tx);
    return saved;
  });
}
