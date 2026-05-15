-- Несколько календарных недель могут попадать в один prayer cycle_index; старый PRIMARY KEY (cycle_index, member_id)
-- делал невозможной запись назначений сбора на каждую неделю отдельно → 500 при распределении кураторов.

DO $cycle_claims_pk$
DECLARE
  pk_len int;
BEGIN
  SELECT array_length(c.conkey, 1) INTO pk_len
  FROM pg_constraint c
  WHERE c.conrelid = 'public.cycle_collection_claims'::regclass AND c.contype = 'p'
  LIMIT 1;

  IF COALESCE(pk_len, 0) = 2 THEN
    ALTER TABLE public.cycle_collection_claims ADD COLUMN IF NOT EXISTS id BIGINT;
    CREATE SEQUENCE IF NOT EXISTS cycle_collection_claims_id_seq;
    PERFORM setval(
      'cycle_collection_claims_id_seq',
      GREATEST(COALESCE((SELECT MAX(id) FROM public.cycle_collection_claims), 0), 1),
      true
    );
    UPDATE public.cycle_collection_claims SET id = nextval('cycle_collection_claims_id_seq') WHERE id IS NULL;
    ALTER TABLE public.cycle_collection_claims ALTER COLUMN id SET DEFAULT nextval('cycle_collection_claims_id_seq');
    ALTER TABLE public.cycle_collection_claims ALTER COLUMN id SET NOT NULL;
    ALTER TABLE public.cycle_collection_claims DROP CONSTRAINT cycle_collection_claims_pkey;
    ALTER TABLE public.cycle_collection_claims ADD CONSTRAINT cycle_collection_claims_pkey PRIMARY KEY (id);
    -- Без OWNED BY: при разных владельцах таблицы и последовательности (Docker/Supabase) Postgres даёт 55000.
    -- DEFAULT nextval(...) уже привязан к колонке id — этого достаточно для вставок.
  END IF;
END
$cycle_claims_pk$;

DROP INDEX IF EXISTS cycle_collection_claims_week_member_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS cycle_collection_claims_week_member_uidx
  ON cycle_collection_claims (week_start_date, member_id)
  WHERE week_start_date IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cycle_collection_claims_cycle_member_legacy_uidx
  ON cycle_collection_claims (cycle_index, member_id)
  WHERE week_start_date IS NULL;
