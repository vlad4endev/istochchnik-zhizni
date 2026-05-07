ALTER TABLE member_notification_deliveries
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

DROP INDEX IF EXISTS idx_member_notif_deliveries_member_unread;

CREATE INDEX IF NOT EXISTS idx_member_notif_deliveries_member_unread
  ON member_notification_deliveries (member_id, id DESC)
  WHERE opened_at IS NULL AND dismissed_at IS NULL;
