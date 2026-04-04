-- Одноразово: в members меняются местами first_name и last_name, поле name пересобирается.
-- Повторный запуск безопасен (метка в app_data_patches).

CREATE TABLE IF NOT EXISTS app_data_patches (
  patch_id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $swap_member_name_columns$
BEGIN
  IF EXISTS (
    SELECT 1 FROM app_data_patches WHERE patch_id = 'members_fix_first_last_columns_2026_04_06'
  ) THEN
    RAISE NOTICE 'Patch members_fix_first_last_columns_2026_04_06 already applied, skipping.';
    RETURN;
  END IF;

  UPDATE members m SET
    first_name = m.last_name,
    last_name = m.first_name,
    name = TRIM(
      REGEXP_REPLACE(
        CONCAT_WS(
          ' ',
          NULLIF(TRIM(m.last_name), ''),
          NULLIF(TRIM(m.first_name), '')
        ),
        '[[:space:]]+',
        ' ',
        'g'
      )
    )
  WHERE NULLIF(TRIM(COALESCE(m.first_name, '')), '') IS NOT NULL
     OR NULLIF(TRIM(COALESCE(m.last_name, '')), '') IS NOT NULL;

  INSERT INTO app_data_patches (patch_id) VALUES ('members_fix_first_last_columns_2026_04_06');
  RAISE NOTICE 'Applied members_fix_first_last_columns_2026_04_06.';
END;
$swap_member_name_columns$;
