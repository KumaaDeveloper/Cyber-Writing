import { createHash } from "node:crypto";
import { DEFAULT_GEMINI_MODEL } from "./gemini-transport";

type PageContent = { id: string; title: string; blocks: unknown };

type ReviewDocument = {
  title: string;
  theme_title?: string;
  pages: PageContent[];
  references: unknown[];
};

/** Identify the contents actually analyzed for a page (not the global version). */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]),
  );
  return value;
}
export function pageReviewFingerprint(doc: ReviewDocument, page: PageContent) {
  return createHash("sha256")
    .update(JSON.stringify(canonical({
      title: doc.title,
      theme: doc.theme_title || "",
      page: { title: page.title, blocks: page.blocks },
      references: doc.references,
      model: (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim().replace(/^models\//, ""),
      search: process.env.GEMINI_SEARCH_GROUNDING === "true",
      policyVersion: 3,
    })))
    .digest("hex");
}

export function decoratePageReviews<T extends { page_id: string | null; content_hash: string | null }>(
  doc: ReviewDocument,
  reviews: T[],
) {
  const hashes = new Map(doc.pages.map((page) => [page.id, pageReviewFingerprint(doc, page)]));
  return reviews.map((review) => ({
    ...review,
    page_number: doc.pages.findIndex((page) => page.id === review.page_id) + 1,
    review_current: Boolean(review.page_id && review.content_hash && hashes.get(review.page_id) === review.content_hash),
  }));
}
