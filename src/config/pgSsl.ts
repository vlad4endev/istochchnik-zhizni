import fs from 'node:fs';
import type { ConnectionOptions } from 'node:tls';

/**
 * TLS options for node-pg.
 *
 * - DB_SSL=true or sslmode= in DATABASE_URL → enable SSL
 * - DB_SSL_CA / DB_SSL_CA_PATH → PEM CA; when set, rejectUnauthorized defaults to true
 * - DB_SSL_REJECT_UNAUTHORIZED=true|false → explicit override
 *
 * Prefer shipping a CA (Supabase / managed Postgres) over disabling verification.
 */
export type PgSslEnv = {
  connectionString?: string | null;
  dbSsl?: string | null;
  rejectUnauthorizedEnv?: string | null;
  caPem?: string | null;
  caPath?: string | null;
};

function readCaFromEnv(caPem?: string | null, caPath?: string | null): string | undefined {
  const inline = (caPem ?? process.env.DB_SSL_CA ?? '').trim();
  if (inline) {
    return inline.replace(/\\n/g, '\n');
  }
  const path = (caPath ?? process.env.DB_SSL_CA_PATH ?? '').trim();
  if (!path) return undefined;
  try {
    return fs.readFileSync(path, 'utf8');
  } catch (err) {
    console.warn(
      '[db] Failed to read DB_SSL_CA_PATH:',
      err instanceof Error ? err.message : String(err),
    );
    return undefined;
  }
}

export function resolveUseSsl(connectionString?: string | null, dbSsl?: string | null): boolean {
  const forceSsl = (dbSsl ?? process.env.DB_SSL) === 'true';
  const hasSslMode = Boolean(connectionString?.includes('sslmode='));
  return forceSsl || hasSslMode;
}

export function buildPgSslOptions(env: PgSslEnv = {}): ConnectionOptions | undefined {
  const connectionString = env.connectionString ?? process.env.DATABASE_URL;
  if (!resolveUseSsl(connectionString, env.dbSsl)) {
    return undefined;
  }

  const ca = readCaFromEnv(env.caPem, env.caPath);
  const rejectEnv = (env.rejectUnauthorizedEnv ?? process.env.DB_SSL_REJECT_UNAUTHORIZED ?? '').trim();

  let rejectUnauthorized: boolean;
  if (rejectEnv === 'true') {
    rejectUnauthorized = true;
  } else if (rejectEnv === 'false') {
    rejectUnauthorized = false;
  } else {
    // Default: verify when a CA is provided; otherwise keep legacy soft-fail for managed pools.
    rejectUnauthorized = Boolean(ca);
  }

  const opts: ConnectionOptions = { rejectUnauthorized };
  if (ca) {
    opts.ca = ca;
  }
  return opts;
}
