-- Personal sermon outline documents for preachers ("Мои проповеди").
CREATE TABLE IF NOT EXISTS sermon_notes (
  id BIGSERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL DEFAULT '',
  topic VARCHAR(500) NOT NULL DEFAULT '',
  scripture VARCHAR(500) NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  service_plan_id BIGINT REFERENCES service_plans(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sermon_notes_member_updated
  ON sermon_notes (member_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sermon_notes_service_plan
  ON sermon_notes (service_plan_id)
  WHERE service_plan_id IS NOT NULL;
