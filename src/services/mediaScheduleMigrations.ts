import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { query } from '../config/db';

export const MEDIA_SCHEDULE_MIGRATION_FILES = [
  '20260615000001_media_schedule.sql',
  '20260615150000_media_schedule_planner_link.sql',
] as const;

export function mediaScheduleMigrationsDir(): string {
  return join(__dirname, '..', '..', 'supabase', 'migrations');
}

/** Идемпотентно создаёт media_roles / media_assignments (IF NOT EXISTS). */
export async function ensureMediaScheduleSchema(): Promise<void> {
  const dir = mediaScheduleMigrationsDir();

  const patchPath = join(dir, '20260615160000_media_roles_ministry_role_filter.sql');
  if (existsSync(patchPath)) {
    await query(readFileSync(patchPath, 'utf8'));
  }

  const exists = await query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'media_assignments'
     ) AS ok`,
  );
  if ((exists.rows[0] as { ok?: boolean } | undefined)?.ok) {
    return;
  }

  for (const file of MEDIA_SCHEDULE_MIGRATION_FILES) {
    const path = join(dir, file);
    if (!existsSync(path)) {
      console.warn(`[media-schedule] migration file missing: ${file}`);
      continue;
    }
    const sql = readFileSync(path, 'utf8');
    await query(sql);
  }
}
