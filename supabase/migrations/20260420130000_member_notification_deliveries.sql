-- Журнал push/напоминаний для бейджа «не открыто»: пока opened_at IS NULL — входит в счётчик.

CREATE TABLE IF NOT EXISTS member_notification_deliveries (
  id BIGSERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  source VARCHAR(32) NOT NULL DEFAULT 'push',
  tag TEXT,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_member_notif_deliveries_member_unread
  ON member_notification_deliveries (member_id, id DESC)
  WHERE opened_at IS NULL;
