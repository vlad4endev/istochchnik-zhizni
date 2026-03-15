import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const forceSsl = process.env.DB_SSL === 'true';
const hasSslModeInConnectionString = connectionString?.includes('sslmode=');
const useSsl = forceSsl || Boolean(hasSslModeInConnectionString);
const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';

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
