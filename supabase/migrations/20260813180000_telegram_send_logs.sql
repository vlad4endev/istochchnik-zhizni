-- Журнал отправок Telegram (авторассылки и связанные уведомления)
-- Без FK на members: у части ролей БД нет права REFERENCES; связь мягкая.
CREATE TABLE IF NOT EXISTS public.telegram_send_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  batch_id UUID NOT NULL,
  channel VARCHAR(64) NOT NULL,
  trigger_source VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL,
  recipient_type VARCHAR(32) NOT NULL,
  member_id INTEGER,
  member_name TEXT,
  telegram_chat_id TEXT,
  chat_title TEXT,
  scenario_id TEXT,
  kind TEXT,
  message_text TEXT NOT NULL DEFAULT '',
  error_code TEXT,
  error_description TEXT,
  http_status INTEGER,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_telegram_send_logs_created_desc
  ON public.telegram_send_logs (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_send_logs_batch
  ON public.telegram_send_logs (batch_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_send_logs_channel_created
  ON public.telegram_send_logs (channel, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_send_logs_status_created
  ON public.telegram_send_logs (status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_send_logs_member
  ON public.telegram_send_logs (member_id, created_at DESC)
  WHERE member_id IS NOT NULL;
