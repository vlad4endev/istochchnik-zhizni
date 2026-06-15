-- Сетлисты, автоматически созданные из опубликованной программы планировщика
ALTER TABLE setlists ADD COLUMN IF NOT EXISTS source_service_plan_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'setlists_source_service_plan_id_fkey'
  ) THEN
    ALTER TABLE setlists
      ADD CONSTRAINT setlists_source_service_plan_id_fkey
      FOREIGN KEY (source_service_plan_id) REFERENCES service_plans(id) ON DELETE SET NULL;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_setlists_source_service_plan_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_setlists_source_service_plan_member
  ON setlists (source_service_plan_id, member_id)
  WHERE source_service_plan_id IS NOT NULL;
