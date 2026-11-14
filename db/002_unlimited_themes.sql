-- Preserve existing themes and their submission references while removing the
-- original three-theme constraint. Defer ordering uniqueness until COMMIT so
-- deleting/reordering themes never collides with their old positions.
ALTER TABLE session_themes DROP CONSTRAINT IF EXISTS session_themes_display_order_check;
ALTER TABLE session_themes ADD CONSTRAINT session_themes_display_order_check CHECK (display_order >= 0);
ALTER TABLE session_themes DROP CONSTRAINT IF EXISTS session_themes_session_id_display_order_key;
ALTER TABLE session_themes ADD CONSTRAINT session_themes_session_id_display_order_key UNIQUE (session_id, display_order) DEFERRABLE INITIALLY DEFERRED;
