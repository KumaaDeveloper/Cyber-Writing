-- Earlier installations used a UNIQUE index with this name. Keep each forced
-- review as a separate record, including after upgrading those installations.
DROP INDEX IF EXISTS reviews_page_content;
CREATE INDEX reviews_page_content
  ON ai_reviews(submission_id, page_id, content_hash, checked_at DESC)
  WHERE page_id IS NOT NULL;
