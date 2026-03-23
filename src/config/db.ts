import { Pool, type PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const rawConnectionString = process.env.DATABASE_URL;
const forceSsl = process.env.DB_SSL === 'true';
const hasSslModeInConnectionString = rawConnectionString?.includes('sslmode=');
const useSsl = forceSsl || Boolean(hasSslModeInConnectionString);
const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
const dbDebugLog = process.env.DB_DEBUG_LOG === 'true';

/**
 * Supabase / PgBouncer **transaction** pooler (порт 6543): node-pg должен отключить
 * prepared statements (`pgbouncer=true`), иначе соединения обрываются mid-query.
 * Предпочтительнее для Node — **session** pooler на 5432 (см. .env.example).
 */
function resolveConnectionString(raw: string): string {
  try {
    const u = new URL(raw);
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
  return raw;
}

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
