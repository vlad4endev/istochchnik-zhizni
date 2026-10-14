import { pool } from '../config/db';

export type AppLogLevel = 'info' | 'warn' | 'error';

export interface AppLogRecord {
  id: number;
  level: AppLogLevel;
  scope: string;
  event: string;
  message: string;
  context: Record<string, unknown>;
  request_method: string | null;
  request_path: string | null;
  status_code: number | null;
  duration_ms: number | null;
  user_id: number | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface WriteAppLogInput {
  level: AppLogLevel;
  scope: string;
  event: string;
  message: string;
  context?: Record<string, unknown>;
  request_method?: string;
  request_path?: string;
  status_code?: number;
  duration_ms?: number;
  user_id?: number;
  ip?: string;
  user_agent?: string;
}

const LOG_LIMIT = Math.min(3000, Math.max(1000, Number(process.env.APP_LOG_MAX_ROWS ?? 3000)));
const LOG_RETENTION_DAYS = Math.max(1, Number(process.env.APP_LOG_RETENTION_DAYS ?? 90));

function safeContext(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

/** Размер пачки при удалении: большие удаления одним запросом долго держат таблицу и раздувают WAL. */
const CLEANUP_BATCH_SIZE = Math.min(
  100_000,
  Math.max(1000, Number(process.env.APP_LOG_CLEANUP_BATCH ?? 20_000)),
);

/**
 * Удаляет строки пачками по `ctid` (быстро, без полного скана): `selectOldestSql` должен выбирать `ctid`
 * самых старых строк, подлежащих удалению, и принимать `$1…$n` из `params` плюс `$last` — лимит пачки.
 */
async function deleteInBatches(selectOldestSql: string, params: unknown[]): Promise<number> {
  if (!pool) return 0;
  const limitParam = `$${params.length + 1}`;
  let total = 0;
  for (;;) {
    const result = await pool.query(
      `
        WITH doomed AS (${selectOldestSql} LIMIT ${limitParam})
        DELETE FROM app_logs a USING doomed d WHERE a.ctid = d.ctid
      `,
      [...params, CLEANUP_BATCH_SIZE],
    );
    const deleted = result.rowCount ?? 0;
    total += deleted;
    if (deleted < CLEANUP_BATCH_SIZE) return total;
  }
}

async function cleanupLogTail(): Promise<number> {
  if (!pool) return 0;
  // Граница: (LOG_LIMIT+1)-я по свежести строка — она и всё старее удаляются.
  const edge = await pool.query(
    // created_at::text — чтобы не потерять микросекунды при проходе через JS Date.
    `SELECT created_at::text AS created_at, id::text AS id FROM app_logs ORDER BY created_at DESC, id DESC OFFSET $1 LIMIT 1`,
    [LOG_LIMIT],
  );
  const row = edge.rows[0] as { created_at: string; id: string } | undefined;
  if (!row) return 0;
  return deleteInBatches(
    `SELECT ctid FROM app_logs WHERE (created_at, id) <= ($1::timestamptz, $2::bigint) ORDER BY created_at, id`,
    [row.created_at, row.id],
  );
}

async function cleanupOldLogsByRetention(): Promise<number> {
  return deleteInBatches(
    `SELECT ctid FROM app_logs WHERE created_at < NOW() - ($1::int * INTERVAL '1 day') ORDER BY created_at`,
    [LOG_RETENTION_DAYS],
  );
}

export async function runAppLogCleanup(): Promise<{
  deletedByRetention: number;
  deletedByLimit: number;
}> {
  const deletedByRetention = await cleanupOldLogsByRetention();
  const deletedByLimit = await cleanupLogTail();
  return { deletedByRetention, deletedByLimit };
}

export async function writeAppLog(input: WriteAppLogInput): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `
        INSERT INTO app_logs (
          level, scope, event, message, context, request_method, request_path,
          status_code, duration_ms, user_id, ip, user_agent
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12)
      `,
      [
        input.level,
        input.scope,
        input.event,
        input.message,
        JSON.stringify(safeContext(input.context)),
        input.request_method ?? null,
        input.request_path ?? null,
        Number.isFinite(input.status_code) ? input.status_code : null,
        Number.isFinite(input.duration_ms) ? input.duration_ms : null,
        Number.isFinite(input.user_id) ? input.user_id : null,
        input.ip ?? null,
        input.user_agent ?? null,
      ],
    );
  } catch (err) {
    console.error('[app-log] write failed', err);
  }
}

export async function listAppLogs(params?: {
  limit?: unknown;
  offset?: unknown;
  level?: AppLogLevel;
  search?: string;
}): Promise<AppLogRecord[]> {
  if (!pool) return [];
  const limit = Math.min(200, Math.max(1, Number(params?.limit ?? 50)));
  const offset = Math.max(0, Number(params?.offset ?? 0));
  const level = params?.level ?? null;
  const search = (params?.search ?? '').trim();

  const { rows } = await pool.query<AppLogRecord>(
    `
      SELECT
        id, level, scope, event, message, context,
        request_method, request_path, status_code, duration_ms,
        user_id, ip, user_agent, created_at::text
      FROM app_logs
      WHERE ($1::text IS NULL OR level = $1::text)
        AND (
          $2::text = ''
          OR message ILIKE '%' || $2::text || '%'
          OR event ILIKE '%' || $2::text || '%'
          OR scope ILIKE '%' || $2::text || '%'
          OR request_path ILIKE '%' || $2::text || '%'
        )
      ORDER BY created_at DESC, id DESC
      LIMIT $3
      OFFSET $4
    `,
    [level, search, limit, offset],
  );
  return rows;
}
