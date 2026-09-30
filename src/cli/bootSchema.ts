/**
 * Поднимает схему БД так, как это делает API на старте: initDb + все ensure*Schema.
 * Нужен для scripts/schema-drift.sh (сверка со supabase/migrations). DATABASE_URL — из окружения.
 */
import { initDb } from '../config/initDb';
import { pool } from '../config/db';
import { ensurePushSubscriptionsSchema } from '../services/pushSubscriptionsSchema';
import { ensureFeedSchema } from '../services/feedSchema';
import { ensureMediaScheduleSchema } from '../services/mediaScheduleMigrations';
import { ensureMusicScheduleSchema } from '../services/musicScheduleMigrations';
import { ensureSermonNotesSchema } from '../services/sermonNotesService';
import { ensureTelegramSendLogsSchema } from '../services/telegramSendLogService';
import { ensureAppReleasesSchema } from '../services/appReleasesService';

const steps: Array<[string, () => Promise<unknown>]> = [
  ['initDb', initDb],
  ['ensurePushSubscriptionsSchema', ensurePushSubscriptionsSchema],
  ['ensureFeedSchema', ensureFeedSchema],
  ['ensureMediaScheduleSchema', ensureMediaScheduleSchema],
  ['ensureMusicScheduleSchema', ensureMusicScheduleSchema],
  ['ensureSermonNotesSchema', ensureSermonNotesSchema],
  ['ensureTelegramSendLogsSchema', ensureTelegramSendLogsSchema],
  ['ensureAppReleasesSchema', ensureAppReleasesSchema],
];

async function main(): Promise<void> {
  for (const [name, fn] of steps) {
    await fn();
    console.log(`[bootSchema] ${name} ok`);
  }
  await pool?.end();
}

main().catch((e) => {
  console.error('[bootSchema] FAILED', e);
  process.exit(1);
});
