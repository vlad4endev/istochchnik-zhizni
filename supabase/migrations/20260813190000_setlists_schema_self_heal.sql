-- Self-heal columns required by studio setlist API when SKIP_DB_INIT_ON_START
-- skipped full initDb. Mirrors ensureSetlistSchema() in studioService.ts.

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

ALTER TABLE public.setlists
  ADD COLUMN IF NOT EXISTS source_service_plan_id BIGINT;

ALTER TABLE public.setlist_items
  ADD COLUMN IF NOT EXISTS musician_notes JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.studio_versions
  ADD COLUMN IF NOT EXISTS sheet_content TEXT;

ALTER TABLE public.studio_versions
  ADD COLUMN IF NOT EXISTS sheet_key VARCHAR(32);

ALTER TABLE public.studio_versions
  ADD COLUMN IF NOT EXISTS sheet_meta JSONB;
