import { createHash } from "node:crypto";

type PageContent = { id: string; title: string; blocks: unknown };

type ReviewDocument = {
  title: string;
  theme_title?: string;
  pages: PageContent[];
  references: unknown[];
};

/** Identify the contents actually analyzed for a page (not the global version). */
export function pageReviewFingerprint(doc: ReviewDocument, page: PageContent) {
  return createHash("sha256")
    .update(JSON.stringify({
      title: doc.title,
      theme: doc.theme_title || "",
      page: { title: page.title, blocks: page.blocks },
      references: doc.references,
      policyVersion: 2,
    }))
    .digest("hex");
}

export function decoratePageReviews<T extends { page_id: string | null; content_hash: string | null }>(
  doc: ReviewDocument,
  reviews: T[],
) {
  const hashes = new Map(doc.pages.map((page) => [page.id, pageReviewFingerprint(doc, page)]));
  return reviews.map((review) => ({
    ...review,
    review_current: Boolean(review.page_id && review.content_hash && hashes.get(review.page_id) === review.content_hash),
  }));
}