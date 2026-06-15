-- Admin impersonation audit log and active session overlay (keyed by access token hash).

CREATE TABLE IF NOT EXISTS public.audit_impersonation (
  id          BIGSERIAL PRIMARY KEY,
  admin_id    BIGINT NOT NULL REFERENCES public.members(id),
  target_id   BIGINT NOT NULL REFERENCES public.members(id),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,
  ip_address  TEXT,
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS audit_impersonation_admin_id_idx
  ON public.audit_impersonation (admin_id);

CREATE INDEX IF NOT EXISTS audit_impersonation_target_id_idx
  ON public.audit_impersonation (target_id);

CREATE INDEX IF NOT EXISTS audit_impersonation_started_at_idx
  ON public.audit_impersonation (started_at);

/** Active impersonation overlay per access token (opaque session, not JWT). */
CREATE TABLE IF NOT EXISTS public.auth_impersonation_active (
  access_token_hash CHAR(64) PRIMARY KEY,
  admin_id          BIGINT NOT NULL REFERENCES public.members(id),
  target_id         BIGINT NOT NULL REFERENCES public.members(id),
  audit_id          BIGINT REFERENCES public.audit_impersonation(id) ON DELETE SET NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_impersonation_active_admin_id_idx
  ON public.auth_impersonation_active (admin_id);

CREATE INDEX IF NOT EXISTS auth_impersonation_active_target_id_idx
  ON public.auth_impersonation_active (target_id);

CREATE INDEX IF NOT EXISTS auth_impersonation_active_expires_at_idx
  ON public.auth_impersonation_active (expires_at);
