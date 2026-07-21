-- Rich document body + public share links for sermon notes.
ALTER TABLE sermon_notes ADD COLUMN IF NOT EXISTS body_format VARCHAR(32) NOT NULL DEFAULT 'plain';
ALTER TABLE sermon_notes ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sermon_notes ADD COLUMN IF NOT EXISTS share_token UUID UNIQUE DEFAULT gen_random_uuid();
ALTER TABLE sermon_notes ADD COLUMN IF NOT EXISTS share_token_issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE sermon_notes SET share_token = gen_random_uuid() WHERE share_token IS NULL;
UPDATE sermon_notes
SET share_token_issued_at = COALESCE(share_token_issued_at, created_at, NOW())
WHERE share_token_issued_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sermon_notes_share_token
  ON sermon_notes (share_token)
  WHERE is_public = TRUE;
