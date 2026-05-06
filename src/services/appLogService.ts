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

async function cleanupLogTail(): Promise<number> {
  if (!pool) return 0;
  const result = await pool.query(
    `
      DELETE FROM app_logs
      WHERE id IN (
        SELECT id
        FROM app_logs
        ORDER BY created_at DESC, id DESC
        OFFSET $1
      )
    `,
    [LOG_LIMIT],
  );
  return result.rowCount ?? 0;
}

async function cleanupOldLogsByRetention(): Promise<number> {
  if (!pool) return 0;
  const result = await pool.query(
    `
      DELETE FROM app_logs
      WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')
    `,
    [LOG_RETENTION_DAYS],
  );
  return result.rowCount ?? 0;
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
