-- Expand FCM device registry + per-member DND / push prefs
-- Additive. Compatible with existing user_subscriptions.

ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS app_version TEXT;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_last_seen
  ON user_subscriptions (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS member_push_prefs (
  member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  messages_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  calls_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  system_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  dnd_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  dnd_start_minute SMALLINT NOT NULL DEFAULT 1320, -- 22:00
  dnd_end_minute SMALLINT NOT NULL DEFAULT 480,   -- 08:00
  timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
