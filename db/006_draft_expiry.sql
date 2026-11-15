CREATE INDEX IF NOT EXISTS submissions_draft_activity ON submissions(updated_at) WHERE status='draft';
