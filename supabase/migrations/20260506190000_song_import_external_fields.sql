-- Song import: external ids, source URLs, fetched texts, retry markers
ALTER TABLE songs ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS table_of_contents TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS url_lyrics TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS url_chords TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS url_youtube TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS lyrics_text TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS chords_text TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS needs_retry BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS songs_external_id_uidx
  ON songs (external_id);

