-- Сбор нужд по циклу: один ответственный на участника за цикл (замена next_week_collection_picks).

DROP TABLE IF EXISTS public.next_week_collection_picks;

CREATE TABLE IF NOT EXISTS public.cycle_collection_claims (
  cycle_index INTEGER NOT NULL,
  member_id INTEGER NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  claimed_by_member_id INTEGER NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cycle_index, member_id)
);

CREATE INDEX IF NOT EXISTS cycle_collection_claims_cycle_idx
  ON public.cycle_collection_claims (cycle_index);

CREATE INDEX IF NOT EXISTS cycle_collection_claims_claimer_idx
  ON public.cycle_collection_claims (claimed_by_member_id);
