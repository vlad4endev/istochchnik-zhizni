import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { query } from '../config/db';

export const MUSIC_SCHEDULE_MIGRATION_FILES = ['20260617120000_music_schedule.sql'] as const;

export function musicScheduleMigrationsDir(): string {
  return join(__dirname, '..', '..', 'supabase', 'migrations');
}

/** Идемпотентно создаёт music_roles / music_assignments (IF NOT EXISTS). */
export async function ensureMusicScheduleSchema(): Promise<void> {
  const exists = await query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'music_assignments'
     ) AS ok`,
  );
  if ((exists.rows[0] as { ok?: boolean } | undefined)?.ok) {
    return;
  }

  const dir = musicScheduleMigrationsDir();
  for (const file of MUSIC_SCHEDULE_MIGRATION_FILES) {
    const path = join(dir, file);
    if (!existsSync(path)) {
      console.warn(`[music-schedule] migration file missing: ${file}`);
      continue;
    }
    const sql = readFileSync(path, 'utf8');
    await query(sql);
  }
}
