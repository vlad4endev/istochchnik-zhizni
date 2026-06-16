/**
 * Сброс пароля участника по телефону (как в админке: password_reset_required).
 *
 * Локально: npm run db:reset-password -- 79027330094
 * Docker:   docker compose exec -T api node dist/cli/resetMemberPassword.js 79027330094
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
  const raw = process.argv[2]?.trim() ?? '';
  const variants = phoneDigitsVariants(raw);
  if (!variants.length) {
    console.error('Укажите телефон: node dist/cli/resetMemberPassword.js 79027330094');
    process.exit(1);
  }

  const client = buildClient();
  await client.connect();

  try {
    const found = await client.query<{ id: number; phone_number: string | null }>(
      `SELECT id, phone_number
       FROM members
       WHERE regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g') = ANY($1::text[])
       ORDER BY id`,
      [variants],
    );

    if (found.rows.length === 0) {
      console.error('[reset-password] Участник не найден. Варианты цифр:', variants);
      process.exit(1);
    }
    if (found.rows.length > 1) {
      console.error('[reset-password] Несколько записей с этим номером:', found.rows);
      process.exit(1);
    }

    const member = found.rows[0];
    await client.query(
      `UPDATE members
       SET password_hash = NULL,
           password_reset_required = TRUE,
           updated_at = NOW()
       WHERE id = $1`,
      [member.id],
    );
    const sessions = await client.query(`DELETE FROM auth_sessions WHERE member_id = $1`, [member.id]);

    console.log('[reset-password] OK:', {
      id: member.id,
      phone_number: member.phone_number,
      sessions_cleared: sessions.rowCount ?? 0,
    });
    console.log(
      '[reset-password] Пользователь входит по номеру без пароля и задаёт новый на экране входа.',
    );
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error('[reset-password] Ошибка:', err);
  process.exit(1);
});
