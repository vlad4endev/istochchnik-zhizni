-- Rich metadata for multiple Bible translations (catalog + license status).

ALTER TABLE bible_translations
  ADD COLUMN IF NOT EXISTS short_title VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS year VARCHAR(32),
  ADD COLUMN IF NOT EXISTS scope VARCHAR(16) NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS availability VARCHAR(32) NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS sort_order SMALLINT NOT NULL DEFAULT 100;
