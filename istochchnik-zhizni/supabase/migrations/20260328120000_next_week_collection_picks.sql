-- Ответственные за сбор: назначение участников на дни следующей недели (отдельно от цикла молитвы).

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS is_collection_coordinator BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.next_week_collection_picks (
  coordinator_id INTEGER NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  day_date DATE NOT NULL,
  selected_member_id INTEGER REFERENCES public.members (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (coordinator_id, week_start, day_date),
  CONSTRAINT next_week_collection_picks_week_range_chk
    CHECK (day_date >= week_start AND day_date <= week_start + 6)
);

CREATE INDEX IF NOT EXISTS next_week_collection_picks_week_start_idx
  ON public.next_week_collection_picks (week_start);
