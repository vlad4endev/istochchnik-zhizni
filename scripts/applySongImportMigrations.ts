/**
 * Применяет миграции колонок импорта песен и backfill `imported_at`.
 * Использует тот же DATABASE_URL, что и API (.env в корне репозитория).
 *
 * Запуск: npm run db:apply:song-import
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import pg from 'pg';

const ROOT = join(__dirname, '..');

const FILES = [
  'supabase/migrations/20260506190000_song_import_external_fields.sql',
  'supabase/migrations/20260508120000_backfill_songs_imported_at.sql',
  'supabase/migrations/20260614120000_publish_imported_songs_with_content.sql',
  'supabase/migrations/20260615120000_promote_studio_versions_to_catalog.sql',
  'supabase/migrations/20260616120000_publish_all_ready_catalog_songs.sql',
] as const;

function buildClient(): pg.Client {
  const cs = process.env.DATABASE_URL?.trim();
  if (!cs) {
    throw new Error('Задайте DATABASE_URL в .env');
  }
  const useSsl = cs.includes('sslmode=') || process.env.DB_SSL === 'true';
  const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true';
  return new pg.Client({
    connectionString: cs,
    ssl: useSsl ? { rejectUnauthorized } : undefined,
  });
}

async function main(): Promise<void> {
  const client = buildClient();
  await client.connect();
  try {
    for (const rel of FILES) {
      const path = join(ROOT, rel);
      const sql = readFileSync(path, 'utf8');
      console.log(`[applySongImportMigrations] ${rel}`);
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
