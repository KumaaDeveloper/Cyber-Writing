INSERT INTO settings(key,value) VALUES ('writer_cooldown_hours','24') ON CONFLICT(key) DO NOTHING;
CREATE TABLE writer_cooldowns (identity_key text PRIMARY KEY, last_submitted_at timestamptz NOT NULL);
-- Retain a lock even if the corresponding submission is later deleted.
INSERT INTO writer_cooldowns(identity_key,last_submitted_at)
SELECT 'browser:' || owner_hash,max(submitted_at) FROM submissions WHERE submitted_at IS NOT NULL GROUP BY owner_hash;
INSERT INTO writer_cooldowns(identity_key,last_submitted_at)
SELECT 'nim:' || w.nim,max(s.submitted_at) FROM submissions s JOIN writers w ON w.id=s.writer_id WHERE s.submitted_at IS NOT NULL GROUP BY w.nim
ON CONFLICT(identity_key) DO UPDATE SET last_submitted_at=GREATEST(writer_cooldowns.last_submitted_at,excluded.last_submitted_at);
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_owner_hash_session_id_key;
CREATE INDEX submissions_owner_session ON submissions(owner_hash,session_id);
CREATE INDEX writers_nim ON writers(nim);
