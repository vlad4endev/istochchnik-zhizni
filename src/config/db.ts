import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const forceSsl = process.env.DB_SSL === 'true';
const hasSslModeInConnectionString = connectionString?.includes('sslmode=');
const useSsl = forceSsl || Boolean(hasSslModeInConnectionString);
const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
const dbDebugLog = process.env.DB_DEBUG_LOG === 'true';

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

export const pool: Pool | null = connectionString
  ? new Pool({
      connectionString,
      ssl: useSsl ? { rejectUnauthorized } : undefined,
    })
  : null;

export function query(text: string, params?: unknown[]) {
  if (!pool) {
    throw new Error(
      'DATABASE_URL is not defined in .env. Example: postgresql://user:password@localhost:5432/dbname'
    );
  }
  return pool.query(text, params);
}
