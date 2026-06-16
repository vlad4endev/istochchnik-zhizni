/**
 * Миграции расписания медиа-служения. В Docker: node dist/cli/applyMediaScheduleMigrations.js
 */
import { loadEnvFromDotenv } from './loadEnv';
import { ensureMediaScheduleSchema } from '../services/mediaScheduleMigrations';

async function main(): Promise<void> {
  loadEnvFromDotenv();
  for (const file of ['20260615000001_media_schedule.sql', '20260615150000_media_schedule_planner_link.sql']) {
    console.log(`[applyMediaScheduleMigrations] ${file}`);
  }
  await ensureMediaScheduleSchema();
  console.log('[applyMediaScheduleMigrations] Готово.');
}

main().catch((e) => {
  console.error('[applyMediaScheduleMigrations]', e);
  process.exit(1);
});
