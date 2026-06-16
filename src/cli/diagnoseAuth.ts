/**
 * Диагностика входа (members / телефоны / пароли).
 *
 * Локально: npm run db:diagnose:auth
 * В Docker:  docker compose exec -T api node dist/cli/diagnoseAuth.js [79027330094]
 */
import pg from 'pg';

import { loadEnvFromDotenv } from './loadEnv';
import { phoneDigitsVariants } from './phoneDigits';

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
      } else if (found.rows.length === 1) {
        const m = found.rows[0] as {
          is_active: boolean;
          registration_status: string;
          has_password: boolean;
          password_reset_required: boolean;
        };
        const reg = String(m.registration_status ?? '').trim().toLowerCase();
        const mayAuth =
          reg === 'rejected' ||
          (Boolean(m.is_active) && (reg === 'active' || reg === 'pending_review'));
        const reasons: string[] = [];
        if (!mayAuth) {
          reasons.push(`аккаунт недоступен (is_active=${m.is_active}, registration_status=${reg})`);
        }
        if (m.password_reset_required) {
          console.log(
            '[diagnose-auth] Вход: оставьте пароль пустым → откроется форма нового пароля (ответ 428).',
          );
        } else if (!m.has_password) {
          reasons.push('нет password_hash и password_reset_required=false — нужен сброс админом или регистрация');
        }
        if (reasons.length) {
          console.log('[diagnose-auth] Почему 401 «Неверный телефон или пароль»:', reasons.join('; '));
        } else if (m.has_password) {
          console.log(
            '[diagnose-auth] Запись есть, пароль задан — 401 значит неверный пароль или API без фикса сопоставления телефонов (пересоберите api).',
          );
        }
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
