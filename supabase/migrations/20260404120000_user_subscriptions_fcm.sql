-- FCM device tokens per member (native Capacitor). Upsert by (member_id, device_id).

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  fcm_token TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_member_id
  ON user_subscriptions (member_id);
