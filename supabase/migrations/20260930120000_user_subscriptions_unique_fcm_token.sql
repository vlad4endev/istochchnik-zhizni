-- Один FCM-токен принадлежит одному участнику (смена аккаунта на устройстве не должна
-- оставлять прежнего владельца получателем пушей).
DELETE FROM user_subscriptions a
USING user_subscriptions b
WHERE a.fcm_token = b.fcm_token
  AND (a.updated_at, a.id) < (b.updated_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_subscriptions_fcm_token
  ON user_subscriptions (fcm_token);
