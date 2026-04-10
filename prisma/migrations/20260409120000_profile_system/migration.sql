-- Profile System (Instagram-style): profiles, posts, media, comments.
-- IMPORTANT: do not remove or modify existing `members` table.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_media_type') THEN
    CREATE TYPE profile_media_type AS ENUM ('image', 'video');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS user_profiles (
  member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  username VARCHAR(64) NOT NULL,
  display_name VARCHAR(120),
  bio TEXT,
  avatar_url TEXT,

  -- privacy
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  allow_comments VARCHAR(16) NOT NULL DEFAULT 'public'
    CHECK (allow_comments IN ('public', 'followers', 'private')),
  show_activity_status BOOLEAN NOT NULL DEFAULT TRUE,

  -- theme
  theme_mode VARCHAR(16) NOT NULL DEFAULT 'system'
    CHECK (theme_mode IN ('system', 'light', 'dark')),
  theme_accent_color VARCHAR(32),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive unique username
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_username_uidx
  ON user_profiles (LOWER(username));

CREATE TABLE IF NOT EXISTS profile_posts (
  id BIGSERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_posts_member_created
  ON profile_posts (member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS profile_post_media (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES profile_posts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  type profile_media_type NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_profile_post_media_post
  ON profile_post_media (post_id);

CREATE TABLE IF NOT EXISTS profile_post_comments (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES profile_posts(id) ON DELETE CASCADE,
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_post_comments_post_created
  ON profile_post_comments (post_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_profile_post_comments_member
  ON profile_post_comments (member_id);

CREATE TABLE IF NOT EXISTS profile_post_likes (
  post_id BIGINT NOT NULL REFERENCES profile_posts(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_post_likes_post
  ON profile_post_likes (post_id);

-- Project has a separate migration enabling RLS for existing tables.
-- New tables must explicitly enable it to match that posture.
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_post_likes ENABLE ROW LEVEL SECURITY;

