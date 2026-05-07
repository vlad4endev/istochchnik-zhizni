CREATE TABLE IF NOT EXISTS public.auth_refresh_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS auth_refresh_sessions_member_id_idx
  ON public.auth_refresh_sessions (member_id);

CREATE INDEX IF NOT EXISTS auth_refresh_sessions_expires_at_idx
  ON public.auth_refresh_sessions (expires_at);

CREATE INDEX IF NOT EXISTS auth_refresh_sessions_revoked_at_idx
  ON public.auth_refresh_sessions (revoked_at);
