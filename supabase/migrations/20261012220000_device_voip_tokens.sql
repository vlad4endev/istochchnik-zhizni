-- PushKit VoIP tokens for iOS CallKit incoming calls (separate from FCM).

CREATE TABLE IF NOT EXISTS device_voip_tokens (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  voip_token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'ios',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_voip_tokens_member_id
  ON device_voip_tokens (member_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_device_voip_tokens_token
  ON device_voip_tokens (voip_token);
