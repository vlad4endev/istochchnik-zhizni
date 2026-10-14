-- Offline sync v2: monotonic sync_seq, row version, tombstones, idempotency
-- Additive / reversible. Chats are intentionally out of scope.

CREATE SEQUENCE IF NOT EXISTS sync_global_seq;

CREATE TABLE IF NOT EXISTS sync_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_idempotency_member_created
  ON sync_idempotency (member_id, created_at DESC);

-- Helper: ensure sync columns on a table
-- songs / members already have deleted_at + client_id from offline MVP

ALTER TABLE songs ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS sync_seq BIGINT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS device_id TEXT;

ALTER TABLE members ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE members ADD COLUMN IF NOT EXISTS sync_seq BIGINT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS device_id TEXT;

ALTER TABLE church_events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE church_events ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE church_events ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE church_events ADD COLUMN IF NOT EXISTS sync_seq BIGINT;
ALTER TABLE church_events ADD COLUMN IF NOT EXISTS device_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS church_events_client_id_uidx
  ON church_events (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS church_events_sync_seq_idx ON church_events (sync_seq);

ALTER TABLE sermon_notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE sermon_notes ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE sermon_notes ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sermon_notes ADD COLUMN IF NOT EXISTS sync_seq BIGINT;
ALTER TABLE sermon_notes ADD COLUMN IF NOT EXISTS device_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS sermon_notes_client_id_uidx
  ON sermon_notes (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sermon_notes_sync_seq_idx ON sermon_notes (sync_seq);

CREATE INDEX IF NOT EXISTS songs_sync_seq_idx ON songs (sync_seq);
CREATE INDEX IF NOT EXISTS members_sync_seq_idx ON members (sync_seq);

CREATE OR REPLACE FUNCTION sync_touch_row() RETURNS trigger AS $$
BEGIN
  NEW.sync_seq := nextval('sync_global_seq');
  IF TG_OP = 'UPDATE' THEN
    NEW.version := COALESCE(OLD.version, 0) + 1;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.version := COALESCE(NEW.version, 1);
  END IF;
  IF NEW.updated_at IS NULL THEN
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'songs_sync_touch') THEN
    CREATE TRIGGER songs_sync_touch BEFORE INSERT OR UPDATE ON songs
      FOR EACH ROW EXECUTE PROCEDURE sync_touch_row();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'members_sync_touch') THEN
    CREATE TRIGGER members_sync_touch BEFORE INSERT OR UPDATE ON members
      FOR EACH ROW EXECUTE PROCEDURE sync_touch_row();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'church_events_sync_touch') THEN
    CREATE TRIGGER church_events_sync_touch BEFORE INSERT OR UPDATE ON church_events
      FOR EACH ROW EXECUTE PROCEDURE sync_touch_row();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sermon_notes_sync_touch') THEN
    CREATE TRIGGER sermon_notes_sync_touch BEFORE INSERT OR UPDATE ON sermon_notes
      FOR EACH ROW EXECUTE PROCEDURE sync_touch_row();
  END IF;
END $$;

-- Backfill sync_seq for existing rows (stable order by updated_at, id)
UPDATE songs SET sync_seq = nextval('sync_global_seq') WHERE sync_seq IS NULL;
UPDATE members SET sync_seq = nextval('sync_global_seq') WHERE sync_seq IS NULL;
UPDATE church_events SET sync_seq = nextval('sync_global_seq') WHERE sync_seq IS NULL;
UPDATE sermon_notes SET sync_seq = nextval('sync_global_seq') WHERE sync_seq IS NULL;
