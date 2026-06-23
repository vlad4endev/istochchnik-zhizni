-- Synced with supabase/migrations/20260624120000_studio_version_sheet.sql
ALTER TABLE studio_versions ADD COLUMN IF NOT EXISTS sheet_content TEXT;
ALTER TABLE studio_versions ADD COLUMN IF NOT EXISTS sheet_key VARCHAR(32);
ALTER TABLE studio_versions ADD COLUMN IF NOT EXISTS sheet_meta JSONB;
