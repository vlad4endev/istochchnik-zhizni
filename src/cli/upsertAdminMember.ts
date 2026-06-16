/**
 * Создать или обновить участника с ролью admin и паролем.
 *
 * Пароль лучше через env (не попадает в history): UPSERT_ADMIN_PASSWORD='…'
 *
 * Docker:
 *   docker compose exec -T -e UPSERT_ADMIN_PASSWORD='…' api \
 *     node dist/cli/upsertAdminMember.js 9001234567
 *
 * С именем:
 *   … node dist/cli/upsertAdminMember.js 9001234567 '' Влад Админ
 */
import { randomBytes, scrypt as scryptCallback } from 'crypto';
import { promisify } from 'util';

import pg from 'pg';

import { loadEnvFromDotenv } from './loadEnv';
import { formatPhoneForStorage, phoneDigitsVariants } from './phoneDigits';

const scrypt = promisify(scryptCallback);
const MIN_PASSWORD_LENGTH = 8;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString('hex')}`;
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
  const phoneRaw = process.argv[2]?.trim() ?? '';
  const password =
    process.argv[3]?.trim() ||
    process.env.UPSERT_ADMIN_PASSWORD?.trim() ||
    process.env.ADMIN_PASSWORD?.trim() ||
    '';
  const firstName = process.argv[4]?.trim() || 'Админ';
  const lastName = process.argv[5]?.trim() || 'Система';

  const variants = phoneDigitsVariants(phoneRaw);
  if (!variants.length) {
    console.error('Укажите телефон: node dist/cli/upsertAdminMember.js 9001234567');
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Пароль не короче ${MIN_PASSWORD_LENGTH} символов (argv[3] или UPSERT_ADMIN_PASSWORD).`);
    process.exit(1);
  }

  const phoneStored = formatPhoneForStorage(phoneRaw);
  const fullName = `${firstName} ${lastName}`.trim();
  const passwordHash = await hashPassword(password);

  const client = buildClient();
  await client.connect();

  try {
    const found = await client.query<{ id: number }>(
      `SELECT id FROM members
       WHERE regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g') = ANY($1::text[])
       ORDER BY id
       LIMIT 2`,
      [variants],
    );

    if (found.rows.length > 1) {
      console.error('[upsert-admin] Несколько записей с этим номером — объедините вручную.');
      process.exit(1);
    }

    if (found.rows[0]) {
      const id = found.rows[0].id;
      const updated = await client.query(
        `UPDATE members
         SET first_name = $1,
             last_name = $2,
             name = $3,
             phone_number = $4,
             password_hash = $5,
             app_role = 'admin',
             app_roles = ARRAY['admin']::text[],
             is_active = TRUE,
             registration_status = 'active',
             password_reset_required = FALSE,
             updated_at = NOW()
         WHERE id = $6
         RETURNING id, phone_number, app_role, app_roles`,
        [firstName, lastName, fullName, phoneStored, passwordHash, id],
      );
      await client.query(`DELETE FROM auth_sessions WHERE member_id = $1`, [id]);
      console.log('[upsert-admin] Обновлён существующий участник:', updated.rows[0]);
    } else {
      const inserted = await client.query(
        `INSERT INTO members (
           first_name, last_name, name, phone_number, password_hash,
           app_role, app_roles, is_active, registration_status, password_reset_required
         )
         VALUES ($1, $2, $3, $4, $5, 'admin', ARRAY['admin']::text[], TRUE, 'active', FALSE)
         RETURNING id, phone_number, app_role, app_roles`,
        [firstName, lastName, fullName, phoneStored, passwordHash],
      );
      console.log('[upsert-admin] Создан новый участник:', inserted.rows[0]);
    }

    console.log('[upsert-admin] Вход: телефон', phoneStored, '(или цифры без +7)');
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error('[upsert-admin] Ошибка:', err);
  process.exit(1);
});
