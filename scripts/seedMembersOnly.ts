/**
 * Заполняет таблицу members базовым списком (идемпотентно).
 * Из корня проекта: npx ts-node scripts/seedMembersOnly.ts
 * Требуется DATABASE_URL в .env
 *
 * Подсказка: в .env для Docker часто `...@db:5432/...` — имя db видно только из контейнеров.
 * С хоста скрипт подставляет 127.0.0.1 и POSTGRES_HOST_PORT (см. docker-compose.local.yml).
 * Отключить: SEED_NO_DB_HOST_REWRITE=true
 */
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

if (process.env.DATABASE_URL_SEED) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_SEED;
}

function rewriteDatabaseUrlForHostCli(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw || process.env.SEED_NO_DB_HOST_REWRITE === 'true') {
    return;
  }
  const inDocker = fs.existsSync('/.dockerenv');
  if (inDocker) {
    return;
  }
  try {
    const u = new URL(raw);
    if (u.hostname !== 'db') {
      return;
    }
    const hostPort = process.env.POSTGRES_HOST_PORT || '5432';
    u.hostname = '127.0.0.1';
    u.port = hostPort;
    process.env.DATABASE_URL = u.toString();
    console.log(
      `[seed-members] Хост «db» недоступен с машины хоста — подключение: 127.0.0.1:${hostPort} (как в POSTGRES_HOST_PORT)`,
    );
  } catch {
    /* оставляем как есть */
  }
}

rewriteDatabaseUrlForHostCli();

async function main(): Promise<void> {
  const { query } = await import('../src/config/db');
  const { MEMBER_SEED_SQL } = await import('../src/config/memberSeedSql');
  const result = await query(MEMBER_SEED_SQL);
  console.log(
    '[seed-members] Вставлено новых строк:',
    result.rowCount ?? 0,
    '(0 — все имена уже были в таблице)'
  );
  const count = await query('SELECT COUNT(*)::text AS c FROM members');
  console.log('[seed-members] Всего записей в members:', (count.rows[0] as { c?: string })?.c ?? '?');
  const active = await query(
    'SELECT COUNT(*)::text AS c FROM members WHERE is_active IS DISTINCT FROM FALSE'
  );
  console.log('[seed-members] Активных (is_active):', (active.rows[0] as { c?: string })?.c ?? '?');
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed-members] Ошибка:', err);
  process.exit(1);
});
