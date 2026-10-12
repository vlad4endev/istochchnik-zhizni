-- LiveKit audio/video calls: calls, participants, invitations
-- Additive only; safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(16) NOT NULL CHECK (type IN ('direct', 'group')),
  media_type VARCHAR(16) NOT NULL CHECK (media_type IN ('audio', 'video')),
  status VARCHAR(32) NOT NULL CHECK (
    status IN (
      'ringing',
      'waiting',
      'active',
      'ended',
      'declined',
      'missed',
      'cancelled',
      'failed'
    )
  ),
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  livekit_room_name TEXT NOT NULL,
  initiated_by INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  access_mode VARCHAR(16) NOT NULL DEFAULT 'closed'
    CHECK (access_mode IN ('closed', 'link')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  end_reason VARCHAR(64),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT calls_livekit_room_name_unique UNIQUE (livekit_room_name)
);

CREATE INDEX IF NOT EXISTS idx_calls_conversation_created
  ON calls (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_calls_status_created
  ON calls (status, created_at DESC)
  WHERE status IN ('ringing', 'waiting', 'active');

CREATE INDEX IF NOT EXISTS idx_calls_initiated_by
  ON calls (initiated_by, created_at DESC);

CREATE TABLE IF NOT EXISTS call_participants (
  id BIGSERIAL PRIMARY KEY,
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role VARCHAR(32) NOT NULL DEFAULT 'participant'
    CHECK (role IN ('initiator', 'participant', 'moderator')),
  status VARCHAR(32) NOT NULL DEFAULT 'invited'
    CHECK (
      status IN (
        'invited',
        'ringing',
        'joined',
        'left',
        'declined',
        'missed',
        'busy'
      )
    ),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT call_participants_call_user_unique UNIQUE (call_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_call_participants_user_status
  ON call_participants (user_id, status);

CREATE INDEX IF NOT EXISTS idx_call_participants_call
  ON call_participants (call_id);

CREATE TABLE IF NOT EXISTS call_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  max_uses INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT call_invitations_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT call_invitations_max_uses_check CHECK (max_uses IS NULL OR max_uses > 0),
  CONSTRAINT call_invitations_use_count_check CHECK (use_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_call_invitations_call
  ON call_invitations (call_id)
  WHERE revoked_at IS NULL;
