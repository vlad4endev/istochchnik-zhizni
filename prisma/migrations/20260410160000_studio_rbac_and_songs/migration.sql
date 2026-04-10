-- Synced with supabase/migrations/20260410160000_studio_rbac_and_songs.sql
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_app_role_check;
UPDATE members
SET app_role = 'member'
WHERE app_role IS NULL OR app_role NOT IN ('member', 'musician', 'editor', 'admin');
ALTER TABLE members
  ADD CONSTRAINT members_app_role_check
  CHECK (app_role IN ('member', 'musician', 'editor', 'admin'));

CREATE TABLE IF NOT EXISTS songs (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  default_key VARCHAR(32),
  tempo SMALLINT,
  time_signature VARCHAR(32),
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS songs_slug_uidx ON songs (LOWER(slug));

CREATE TABLE IF NOT EXISTS studio_versions (
  id BIGSERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  song_id BIGINT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  custom_content TEXT,
  custom_key VARCHAR(32),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_studio_versions_member ON studio_versions (member_id);
CREATE INDEX IF NOT EXISTS idx_studio_versions_song ON studio_versions (song_id);

CREATE TABLE IF NOT EXISTS studio_drafts (
  id BIGSERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_drafts_member ON studio_drafts (member_id);

CREATE TABLE IF NOT EXISTS studio_instrument_settings (
  member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS song_favorites (
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  song_id BIGINT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (member_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_song_favorites_song ON song_favorites (song_id);

CREATE TABLE IF NOT EXISTS setlists (
  id BIGSERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  event_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_setlists_member ON setlists (member_id);

CREATE TABLE IF NOT EXISTS setlist_items (
  id BIGSERIAL PRIMARY KEY,
  setlist_id BIGINT NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK ("position" >= 0),
  song_id BIGINT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  studio_version_id BIGINT REFERENCES studio_versions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (setlist_id, "position")
);

CREATE INDEX IF NOT EXISTS idx_setlist_items_setlist ON setlist_items (setlist_id, "position");
