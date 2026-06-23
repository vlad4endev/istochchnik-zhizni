-- Отдельная «версия с нотами» в studio_versions (не перезаписывает custom_content).
ALTER TABLE studio_versions ADD COLUMN IF NOT EXISTS sheet_content TEXT;
ALTER TABLE studio_versions ADD COLUMN IF NOT EXISTS sheet_key VARCHAR(32);
ALTER TABLE studio_versions ADD COLUMN IF NOT EXISTS sheet_meta JSONB;
