import { query } from '../config/db';

/**
 * Watermark бейджа ленты.
 * Нужен даже при SKIP_DB_INIT_ON_START=true (иначе GET /api/feed/unread-count → 500).
 * Не создаём user_profiles / profile_posts — их схема полная только в initDb;
 * на проде они уже есть, а missing relation ловит soft-fail в getFeedUnreadCount.
 */
export async function ensureFeedSchema(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS member_feed_watermarks (
      member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(
    `CREATE INDEX IF NOT EXISTS idx_member_feed_watermarks_last_seen_at ON member_feed_watermarks (last_seen_at)`,
  );
}

let feedSchemaEnsurePromise: Promise<void> | null = null;

/** Идемпотентный ensure для hot-path (unread-count), без гонок на старте. */
export function ensureFeedSchemaOnce(): Promise<void> {
  if (!feedSchemaEnsurePromise) {
    feedSchemaEnsurePromise = ensureFeedSchema().catch((err) => {
      feedSchemaEnsurePromise = null;
      throw err;
    });
  }
  return feedSchemaEnsurePromise;
}

function isMissingRelationError(e: unknown): boolean {
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code?: unknown }).code) : '';
  if (code === '42P01') return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /does not exist|relation .* does not exist/i.test(msg);
}

export { isMissingRelationError };
