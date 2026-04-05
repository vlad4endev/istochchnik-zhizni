-- История чата: ускорение выборки по чату с сортировкой от новых к старым.
-- Дублирует определение из Node initDb (idx_messages_conv_created) для окружений, где применяются только Supabase-миграции.
CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON public.messages (conversation_id, created_at DESC);
