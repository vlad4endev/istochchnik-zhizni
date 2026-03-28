/**
 * Заполняет таблицу members базовым списком (идемпотентно).
 * Из корня проекта: npx ts-node scripts/seedMembersOnly.ts
 * Требуется DATABASE_URL в .env
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

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
