-- Блокировка повторных попыток восстановления пароля (после 3 неверных кодов).
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS password_reset_locked_until TIMESTAMPTZ;
