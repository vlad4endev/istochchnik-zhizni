import { existsSync } from 'node:fs';
import { Pool, type PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const forceSsl = process.env.DB_SSL === 'true';
/** По умолчанию false — Supabase/managed Postgres часто дают SELF_SIGNED_CERT_IN_CHAIN при verify-full. Строгая проверка CA: DB_SSL_REJECT_UNAUTHORIZED=true */
const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true';
const dbDebugLog = process.env.DB_DEBUG_LOG === 'true';

/**
 * В docker-compose Postgres называется `db` — это имя резолвится только внутри сети Compose.
 * CLI с хоста (`npm run bible:seed` и т.п.) иначе падает с getaddrinfo EAI_AGAIN db.
 * Отключить: SEED_NO_DB_HOST_REWRITE=true
 */
function rewriteDockerDbHostForHostProcess(raw: string): string {
  if (process.env.SEED_NO_DB_HOST_REWRITE === 'true') {
    return raw;
  }
  if (existsSync('/.dockerenv')) {
    return raw;
  }
  try {
    const u = new URL(raw);
    if (u.hostname !== 'db') {
      return raw;
    }
    const hostPort = process.env.POSTGRES_HOST_PORT || u.port || '5432';
    u.hostname = '127.0.0.1';
    u.port = hostPort;
    const next = u.toString();
    process.env.DATABASE_URL = next;
    console.warn(
      `[db] Хост «db» недоступен с машины хоста — подключение: 127.0.0.1:${hostPort} (POSTGRES_HOST_PORT). Внутри контейнера оставьте @db.`
    );
    return next;
  } catch {
    return raw;
  }
}

/**
 * Supabase / PgBouncer **transaction** pooler (порт 6543): node-pg должен отключить
 * prepared statements (`pgbouncer=true`), иначе соединения обрываются mid-query.
 * Предпочтительнее для Node — **session** pooler на 5432 (см. .env.example).
 */
function resolveConnectionString(raw: string): string {
  const withHost = rewriteDockerDbHostForHostProcess(raw);
  try {
    const u = new URL(withHost);
    const port = u.port || '5432';
    if (port === '6543' && !u.searchParams.has('pgbouncer')) {
      u.searchParams.set('pgbouncer', 'true');
      if (dbDebugLog) {
        console.log(
          '[db] Appended pgbouncer=true (transaction pooler port 6543). Prefer pooler :5432 for session mode if issues persist.'
        );
      }
      return u.toString();
    }
  } catch {
    // fall through
  }
  return withHost;
}

const rawConnectionString = process.env.DATABASE_URL;
const hasSslModeInConnectionString = rawConnectionString?.includes('sslmode=');
const useSsl = forceSsl || Boolean(hasSslModeInConnectionString);
const connectionString = rawConnectionString ? resolveConnectionString(rawConnectionString) : undefined;

function logDatabaseConfig(): void {
  if (!connectionString) {
    console.warn('[db] DATABASE_URL is not set');
    return;
  }

  try {
    const parsedUrl = new URL(connectionString);
    console.log('[db] PostgreSQL config:', {
      host: parsedUrl.hostname,
      port: parsedUrl.port || '5432',
      username: parsedUrl.username,
      database: parsedUrl.pathname.replace(/^\//, '') || 'postgres',
      useSsl,
      rejectUnauthorized,
      hasSslModeInConnectionString,
      pgbouncer: parsedUrl.searchParams.get('pgbouncer') ?? '(not set)',
    });
  } catch (error) {
    console.warn('[db] Failed to parse DATABASE_URL', {
      error: error instanceof Error ? error.message : String(error),
      useSsl,
      rejectUnauthorized,
      hasSslModeInConnectionString,
    });
  }
}

if (dbDebugLog) {
  logDatabaseConfig();
}

function buildPoolConfig(): PoolConfig {
  const max = Math.min(50, Math.max(1, Number(process.env.DB_POOL_MAX ?? 10)));
  const idleTimeoutMillis = Math.max(
    1000,
    Number(process.env.DB_POOL_IDLE_MS ?? 30_000)
  );
  const connectionTimeoutMillis = Math.max(
    2000,
    Number(process.env.DB_POOL_CONNECT_TIMEOUT_MS ?? 15_000)
  );

  return {
    connectionString,
    ssl: useSsl ? { rejectUnauthorized } : undefined,
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  };
}

export const pool: Pool | null = connectionString ? new Pool(buildPoolConfig()) : null;

if (pool) {
  pool.on('error', (err) => {
    console.error('[db] Idle client error (pool will discard the client):', err.message);
  });
}

function isTransientConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const m = err.message;
  return (
    /Connection terminated unexpectedly/i.test(m) ||
    /ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT/i.test(m) ||
    /server closed the connection unexpectedly/i.test(m)
  );
}

export async function query(text: string, params?: unknown[]) {
  if (!pool) {
    throw new Error(
      'DATABASE_URL is not defined in .env. Example: postgresql://user:password@localhost:5432/dbname'
    );
  }
  try {
    return await pool.query(text, params);
  } catch (first) {
    if (!isTransientConnectionError(first)) {
      throw first;
    }
    console.warn('[db] Retrying query after transient DB error:', (first as Error).message);
    return await pool.query(text, params);
  }
}
