CREATE TABLE IF NOT EXISTS public.prayer_section_daily_visits (
  member_id INTEGER NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (member_id, visit_date)
);

CREATE INDEX IF NOT EXISTS idx_prayer_section_daily_visits_visit_date
  ON public.prayer_section_daily_visits (visit_date);
