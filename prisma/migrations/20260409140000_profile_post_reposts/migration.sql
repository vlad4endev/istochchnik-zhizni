-- Reposts: optional link to original post; one reshare of the same root per user.

ALTER TABLE profile_posts
  ADD COLUMN IF NOT EXISTS shared_post_id BIGINT REFERENCES profile_posts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_profile_posts_shared_post_id
  ON profile_posts (shared_post_id)
  WHERE shared_post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_profile_posts_one_repost_per_user_root
  ON profile_posts (member_id, shared_post_id)
  WHERE shared_post_id IS NOT NULL;
