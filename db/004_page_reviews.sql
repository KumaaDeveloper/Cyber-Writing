-- AI reviews are independently saved for every page. Keep previous document-wide
-- review rows (NULL page_id) as history so no existing data is discarded.
ALTER TABLE ai_reviews
  ADD COLUMN IF NOT EXISTS page_id uuid,
  ADD COLUMN IF NOT EXISTS page_number integer,
  ADD COLUMN IF NOT EXISTS content_hash text;
CREATE INDEX IF NOT EXISTS reviews_page_content
  ON ai_reviews(submission_id, page_id, content_hash, checked_at DESC)
  WHERE page_id IS NOT NULL;
