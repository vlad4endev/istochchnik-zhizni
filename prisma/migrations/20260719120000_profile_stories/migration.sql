-- Instagram-style stories (24h expiry) + views for ring "seen" state.
-- NOTE: do not use NOW() in index predicates (not IMMUTABLE).

CREATE TABLE IF NOT EXISTS profile_stories (
  id BIGSERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type profile_media_type NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profile_stories_expires
  ON profile_stories (expires_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profile_stories_member_created
  ON profile_stories (member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS profile_story_views (
  story_id BIGINT NOT NULL REFERENCES profile_stories(id) ON DELETE CASCADE,
  viewer_member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, viewer_member_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_story_views_viewer
  ON profile_story_views (viewer_member_id);
