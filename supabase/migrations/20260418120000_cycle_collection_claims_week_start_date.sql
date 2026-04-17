-- Колонка добавлена в initDb для новых установок; старые БД (миграция 20260328140000) её не имели.
ALTER TABLE public.cycle_collection_claims
  ADD COLUMN IF NOT EXISTS week_start_date DATE;

CREATE UNIQUE INDEX IF NOT EXISTS cycle_collection_claims_week_member_uidx
  ON public.cycle_collection_claims (week_start_date, member_id);

CREATE INDEX IF NOT EXISTS cycle_collection_claims_week_start_idx
  ON public.cycle_collection_claims (week_start_date);
