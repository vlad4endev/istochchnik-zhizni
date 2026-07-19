CREATE TABLE IF NOT EXISTS profile_post_comment_likes (
  comment_id BIGINT NOT NULL REFERENCES profile_post_comments(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_post_comment_likes_comment
  ON profile_post_comment_likes (comment_id);
