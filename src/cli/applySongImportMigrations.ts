/**
 * Миграции каталога песен. В Docker: node dist/cli/applySongImportMigrations.js
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import pg from 'pg';

import { loadEnvFromDotenv } from './loadEnv';

const MIGRATION_FILES = [
  '20260506190000_song_import_external_fields.sql',
  '20260508120000_backfill_songs_imported_at.sql',
  '20260614120000_publish_imported_songs_with_content.sql',
  '20260615120000_promote_studio_versions_to_catalog.sql',
  '20260616120000_publish_all_ready_catalog_songs.sql',
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
        console.warn(`[applySongImportMigrations] пропуск — нет файла ${file}`);
        continue;
      }
      const sql = readFileSync(path, 'utf8');
      console.log(`[applySongImportMigrations] ${file}`);
      await client.query(sql);
    }
    console.log('[applySongImportMigrations] Готово.');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('[applySongImportMigrations]', e);
  process.exit(1);
});
