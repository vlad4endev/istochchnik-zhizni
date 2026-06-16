/**
 * Диагностика входа (members / телефоны / пароли).
 *
 * Локально: npm run db:diagnose:auth
 * В Docker:  docker compose exec -T api node dist/cli/diagnoseAuth.js [79027330094]
 */
import pg from 'pg';

import { loadEnvFromDotenv } from './loadEnv';

function phoneDigitsVariants(phoneOrDigits: string): string[] {
  const digits = phoneOrDigits.replace(/\D+/g, '');
  if (!digits) return [];

  const variants = new Set<string>([digits]);
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    const national = digits.slice(1);
    if (national.length === 10) {
      variants.add(national);
      variants.add(`7${national}`);
      variants.add(`8${national}`);
    }
  }
  if (digits.length === 10) {
    variants.add(`7${digits}`);
    variants.add(`8${digits}`);
  }
  return Array.from(variants);
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
  const client = buildClient();
  await client.connect();

  try {
    const stats = await client.query(`
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
      const unique = phoneDigitsVariants(phoneArg);
      const found = await client.query(
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
      const sample = await client.query(`
        SELECT id, phone_number, is_active, registration_status,
               password_hash IS NOT NULL AS has_password
        FROM members
        WHERE password_hash IS NOT NULL
        ORDER BY id
        LIMIT 5
      `);
      console.log('[diagnose-auth] sample with password:', sample.rows);
    }
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error('[diagnose-auth] Ошибка:', err);
  process.exit(1);
});
