-- Offline sync support: soft delete + client-side UUID mapping (MVP: songs, members)

ALTER TABLE songs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS created_by_device TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS songs_client_id_uidx ON songs (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS songs_updated_at_idx ON songs (updated_at);
CREATE INDEX IF NOT EXISTS songs_deleted_at_idx ON songs (deleted_at) WHERE deleted_at IS NOT NULL;

ALTER TABLE members ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE members ADD COLUMN IF NOT EXISTS client_id UUID;

CREATE INDEX IF NOT EXISTS members_updated_at_idx ON members (updated_at);

-- Replace hard DELETE on songs with soft delete in sync layer; keep existing DELETE for admin API.
