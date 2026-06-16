/**
 * Диагностика входа (только с хоста, где есть ts-node и src/).
 *
 * Локально:  npm run db:diagnose:auth
 * В Docker:   docker compose exec -T api node dist/cli/diagnoseAuth.js [79027330094]
 */
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main(): Promise<void> {
  const { query } = await import('../src/config/db');

  const stats = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE password_hash IS NOT NULL)::int AS with_password,
      COUNT(*) FILTER (WHERE is_active IS TRUE)::int AS active,
      COUNT(*) FILTER (WHERE is_active IS NOT TRUE)::int AS inactive,
      COUNT(*) FILTER (WHERE password_reset_required IS TRUE)::int AS reset_required,
      COUNT(*) FILTER (WHERE registration_status = 'pending_review')::int AS pending,
      COUNT(*) FILTER (WHERE registration_status = 'rejected')::int AS rejected
    FROM members
  `);
  console.log('[diagnose-auth] members:', stats.rows[0]);

  const phoneArg = process.argv[2]?.replace(/\D+/g, '') ?? '';
  if (phoneArg) {
    const variants: string[] = [phoneArg];
    if (phoneArg.length === 11 && (phoneArg.startsWith('7') || phoneArg.startsWith('8'))) {
      const national = phoneArg.slice(1);
      variants.push(national, `7${national}`, `8${national}`);
    }
    if (phoneArg.length === 10) {
      variants.push(`7${phoneArg}`, `8${phoneArg}`);
    }
    const unique = [...new Set(variants)];
    const found = await query(
      `SELECT id, phone_number, is_active, registration_status,
              password_hash IS NOT NULL AS has_password,
              password_reset_required
       FROM members
       WHERE regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g') = ANY($1::text[])
       ORDER BY id`,
      [unique],
    );
    console.log('[diagnose-auth] lookup variants:', unique);
    console.log('[diagnose-auth] matches:', found.rows);
    if (found.rows.length === 0) {
      console.log('[diagnose-auth] Нет записи с такими цифрами — вход даст 401.');
    }
  } else {
    const sample = await query(`
      SELECT id, phone_number, is_active, registration_status,
             password_hash IS NOT NULL AS has_password
      FROM members
      WHERE password_hash IS NOT NULL
      ORDER BY id
      LIMIT 5
    `);
    console.log('[diagnose-auth] sample with password:', sample.rows);
  }

  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('[diagnose-auth] Ошибка:', err);
  process.exit(1);
});
