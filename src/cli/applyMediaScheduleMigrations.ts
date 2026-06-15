/**
 * Миграции расписания медиа-служения. В Docker: node dist/cli/applyMediaScheduleMigrations.js
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import pg from 'pg';

import { loadEnvFromDotenv } from './loadEnv';

const MIGRATION_FILES = [
  '20260615000001_media_schedule.sql',
  '20260615150000_media_schedule_planner_link.sql',
] as const;

function repoRoot(): string {
  return join(__dirname, '..', '..');
}

function buildClient(): pg.Client {
  loadEnvFromDotenv();
  const cs = process.env.DATABASE_URL?.trim();
  if (!cs) throw new Error('Задайте DATABASE_URL в окружении или .env');
  const useSsl = cs.includes('sslmode=') || process.env.DB_SSL === 'true';
  return new pg.Client({
    connectionString: cs,
    ssl: useSsl ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' } : undefined,
  });
}

async function main(): Promise<void> {
  const migrationsDir = join(repoRoot(), 'supabase', 'migrations');
  const client = buildClient();
  await client.connect();
  try {
    for (const file of MIGRATION_FILES) {
      const path = join(migrationsDir, file);
      if (!existsSync(path)) {
        console.warn(`[applyMediaScheduleMigrations] пропуск — нет файла ${file}`);
        continue;
      }
      const sql = readFileSync(path, 'utf8');
      console.log(`[applyMediaScheduleMigrations] ${file}`);
      await client.query(sql);
    }
    console.log('[applyMediaScheduleMigrations] Готово.');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('[applyMediaScheduleMigrations]', e);
  process.exit(1);
});
