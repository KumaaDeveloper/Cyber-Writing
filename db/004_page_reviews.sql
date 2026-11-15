-- Page IDs are stable logical IDs. No FK to submission_pages: saving a document
-- replaces those rows, while its review history must remain intact.
ALTER TABLE ai_reviews ADD COLUMN page_id uuid;
ALTER TABLE ai_reviews ADD COLUMN page_number int CHECK (page_number > 0);
ALTER TABLE ai_reviews ADD COLUMN content_hash text;
CREATE UNIQUE INDEX reviews_page_content ON ai_reviews(submission_id,page_id,content_hash);
