-- Watermark: до какого момента пользователь просмотрел ленту (для бейджа новых постов).
CREATE TABLE IF NOT EXISTS member_feed_watermarks (
  member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_member_feed_watermarks_last_seen_at
  ON member_feed_watermarks (last_seen_at);
