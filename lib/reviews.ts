import { db, rows, sql, type DB, type Executor } from "./db";
import { getDocument } from "./documents";
import { reviewDocument } from "./ai";
import { fail } from "./security";
import { hasContent, type DocumentData, type Page } from "./model";
import { pageReviewFingerprint } from "./page-reviews";

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
export function pageReviewHash(doc: ReviewDoc, page: Page) {
  return pageReviewFingerprint(doc, page);
}
export async function listPageReviews(doc: ReviewDoc, executor: Executor = db()) {
  const reviews = await rows<PageReview>(sql`SELECT * FROM ai_reviews WHERE submission_id=${doc.id} AND page_id IS NOT NULL ORDER BY checked_at DESC,id DESC`, executor);
  return doc.pages.flatMap((page, index) => {
    const matching = reviews.filter((r) => r.page_id === page.id);
    const review = matching.find((r) => r.content_hash === pageReviewHash(doc, page)) || matching[0];
    return review ? [{ ...review, page_number: index + 1, page_title: page.title,
      findings_json: review.findings_json.map((finding: any) => ({ ...finding, page: index + 1 })),
      is_current: review.content_hash === pageReviewHash(doc, page),
      review_current: review.content_hash === pageReviewHash(doc, page),
    }] : [];
  });
}
export async function cachedPageReview(doc: ReviewDoc, pageId: string, executor: Executor = db()) {
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page) return fail(404, "Halaman tidak ditemukan.");
  const [cached] = await rows<PageReview>(sql`SELECT * FROM ai_reviews WHERE submission_id=${doc.id} AND page_id=${pageId} AND content_hash=${pageReviewHash(doc, page)} ORDER BY checked_at DESC,id DESC LIMIT 1`, executor);
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
  if (!hasContent([page])) return fail(400, "Halaman belum memiliki materi untuk diperiksa.");
  const contentHash = pageReviewHash(doc, page);
  const cached = !options.force ? await cachedPageReview(doc, pageId, database) : undefined;
  // Only the requested page is sent; the model uses page 1 locally.
  const result = cached ? undefined : await (options.review || reviewDocument)({
    title: doc.title, theme_title: doc.theme_title,
    pages: [page], references: doc.references,
  });
  return database.transaction(async (tx) => {
    await rows(sql`SELECT id FROM submissions WHERE id=${doc.id} FOR UPDATE`, tx);
    const current = await getDocument(doc.id, tx);
    const pageIndex = current.pages.findIndex((p) => p.id === pageId);
    if (pageIndex < 0 || pageReviewHash(current, current.pages[pageIndex]) !== contentHash)
      return fail(409, "Halaman berubah selama pemeriksaan. Simpan perubahan lalu cek AI lagi.");
    if (cached) {
      const [saved] = await rows<PageReview>(sql`UPDATE ai_reviews SET content_version=${current.version},page_number=${pageIndex + 1} WHERE id=${cached.id} RETURNING *`, tx);
      return saved;
    }
    const findings = result!.findings.map((finding) => ({ ...finding, page: pageIndex + 1 }));
    const [saved] = await rows<PageReview>(sql`INSERT INTO ai_reviews(submission_id,content_version,page_id,page_number,content_hash,status,summary,findings_json,sources_json,search_html,model_name)
      VALUES(${doc.id},${current.version},${pageId},${pageIndex + 1},${contentHash},${result!.status},${result!.summary},${JSON.stringify(findings)}::jsonb,${JSON.stringify(result!.sources)}::jsonb,${result!.search_html},${result!.model}) RETURNING *`, tx);
    return saved;
  });
}
