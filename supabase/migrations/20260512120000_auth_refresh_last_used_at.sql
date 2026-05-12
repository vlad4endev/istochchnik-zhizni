-- Idle-timeout для refresh: last_used_at обновляется при ротации; cleanup удаляет неактивные.
ALTER TABLE public.auth_refresh_sessions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
UPDATE public.auth_refresh_sessions SET last_used_at = created_at WHERE last_used_at IS NULL;
ALTER TABLE public.auth_refresh_sessions ALTER COLUMN last_used_at SET DEFAULT NOW();
ALTER TABLE public.auth_refresh_sessions ALTER COLUMN last_used_at SET NOT NULL;
