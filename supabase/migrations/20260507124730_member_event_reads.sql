CREATE TABLE IF NOT EXISTS member_event_reads (
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES church_events(id) ON DELETE CASCADE,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (member_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_member_event_reads_event_id
  ON member_event_reads (event_id);
