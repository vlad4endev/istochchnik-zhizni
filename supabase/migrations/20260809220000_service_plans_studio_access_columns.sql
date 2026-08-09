-- Columns required by studio setlist access checks (JOIN service_plans).
-- Safe on DBs where planner schema already added them.

CREATE TABLE IF NOT EXISTS public.service_plans (
  id BIGSERIAL PRIMARY KEY,
  service_date DATE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.service_plans
  ADD COLUMN IF NOT EXISTS created_by_member_id INTEGER;

ALTER TABLE public.service_plans
  ADD COLUMN IF NOT EXISTS last_edited_by_member_id INTEGER;

ALTER TABLE public.service_plans
  ADD COLUMN IF NOT EXISTS music_ministry_member_id INTEGER;
