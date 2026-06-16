ALTER TABLE public.media_roles
  ADD COLUMN IF NOT EXISTS ministry_role_filter TEXT;
