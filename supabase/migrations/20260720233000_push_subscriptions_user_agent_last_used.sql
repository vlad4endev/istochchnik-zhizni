-- Columns used by saveSubscription / sendNotificationToSubscription since ac9c986.
-- Without these, POST /api/notifications/subscribe always failed with 500.

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_last_used_at
  ON public.push_subscriptions (last_used_at DESC NULLS LAST);
