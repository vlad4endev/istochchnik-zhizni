import { query } from '../config/db';

/**
 * Колонки, которые нужны saveSubscription / sendNotificationToSubscription.
 * Должны применяться даже при SKIP_DB_INIT_ON_START=true (Portainer prod).
 */
export async function ensurePushSubscriptionsSchema(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      keys_p256dh TEXT NOT NULL,
      keys_auth TEXT NOT NULL,
      user_agent TEXT,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(endpoint)
    )
  `);
  await query(`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_agent TEXT`);
  await query(`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ`);
  await query(`CREATE INDEX IF NOT EXISTS idx_push_subs_member_id ON push_subscriptions (member_id)`);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_push_subscriptions_last_used_at ON push_subscriptions (last_used_at DESC NULLS LAST)`,
  );
}
