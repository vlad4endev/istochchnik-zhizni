-- Synced with supabase/migrations/20260410220000_songbook_stage_and_public_setlists.sql
ALTER TABLE songs ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS songs_tags_gin ON songs USING GIN (tags);
CREATE INDEX IF NOT EXISTS songs_fts_idx ON songs USING GIN (
  to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
);

ALTER TABLE setlists ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE setlists ADD COLUMN IF NOT EXISTS share_token UUID UNIQUE DEFAULT gen_random_uuid();

CREATE TABLE IF NOT EXISTS studio_song_recents (
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  song_id BIGINT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  last_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (member_id, song_id)
);
CREATE INDEX IF NOT EXISTS idx_studio_song_recents_member ON studio_song_recents (member_id, last_opened_at DESC);

UPDATE setlists SET share_token = gen_random_uuid() WHERE share_token IS NULL;
