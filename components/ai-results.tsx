"use client";
import type { Page } from "@/lib/model";
import { date } from "./ui";

export function AIResults({ pages, reviews }: { pages: Page[]; reviews: any[] }) {
  return pages.map((page, index) => {
    const review = reviews.find((item) => item.page_id === page.id);
    return <section className="review-result" key={page.id}>
      <div className="review-page-heading"><strong>Halaman {index + 1}</strong>
        {review && <span className="badge">{review.status}</span>}
      </div>
      {page.title && <div className="review-page-title">{page.title}</div>}
      {!review ? <small>Belum dicek.</small> : <>
        <small>{date(review.checked_at)}</small>
        {review.is_current === false && <div className="warning-banner">Isi halaman berubah. Cek AI lagi.</div>}
        {review.findings_json.map((finding: any, i: number) => <div className="finding" key={i}>
          <strong>{finding.status}</strong>
          <blockquote>{finding.claim}</blockquote>
          <p>{finding.reason}</p>
        </div>)}
        {review.sources_json.map((source: any, i: number) => <a className="source-link" key={i} href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a>)}
        {review.search_html && <iframe title="Penelusuran Google" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={review.search_html} className="search-suggestions" />}
      </>}
    </section>;
  });
}
