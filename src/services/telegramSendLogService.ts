import { randomUUID } from 'crypto';
import { pool, query } from '../config/db';

export type TelegramSendChannel =
  | 'prayer_dispatch'
  | 'service_plan_mailing'
  | 'service_plan_published'
  | 'coordinator_scenario'
  | 'manual'
  | 'password_reset';

export type TelegramSendTrigger = 'cron' | 'run_now' | 'api' | 'event';

export type TelegramSendStatus = 'ok' | 'failed' | 'skipped' | 'blocked';

export type TelegramRecipientType = 'member' | 'telegram_chat';

export interface WriteTelegramSendLogInput {
  batchId?: string;
  channel: TelegramSendChannel;
  trigger: TelegramSendTrigger;
  status: TelegramSendStatus;
  recipientType: TelegramRecipientType;
  memberId?: number | null;
  memberName?: string | null;
  telegramChatId?: string | null;
  chatTitle?: string | null;
  scenarioId?: string | null;
  kind?: string | null;
  messageText?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
  httpStatus?: number | null;
  meta?: Record<string, unknown>;
}

export interface TelegramSendLogRecord {
  id: number;
  created_at: string;
  batch_id: string;
  channel: TelegramSendChannel;
  trigger_source: TelegramSendTrigger;
  status: TelegramSendStatus;
  recipient_type: TelegramRecipientType;
  member_id: number | null;
  member_name: string | null;
  telegram_chat_id: string | null;
  chat_title: string | null;
  scenario_id: string | null;
  kind: string | null;
  message_text: string;
  error_code: string | null;
  error_description: string | null;
  http_status: number | null;
  meta: Record<string, unknown>;
}

export interface TelegramSendBatchSummary {
  batch_id: string;
  channel: TelegramSendChannel;
  trigger_source: TelegramSendTrigger;
  kind: string | null;
  scenario_id: string | null;
  created_at: string;
  total: number;
  ok_count: number;
  failed_count: number;
  blocked_count: number;
  skipped_count: number;
  preview_text: string;
  recipients: Array<{
    id: number;
    status: TelegramSendStatus;
    member_id: number | null;
    member_name: string | null;
    telegram_chat_id: string | null;
    chat_title: string | null;
    error_description: string | null;
    message_text: string;
    created_at: string;
  }>;
}

const LOG_LIMIT = Math.min(8000, Math.max(500, Number(process.env.TELEGRAM_SEND_LOG_MAX_ROWS ?? 5000)));
const LOG_RETENTION_DAYS = Math.max(1, Number(process.env.TELEGRAM_SEND_LOG_RETENTION_DAYS ?? 90));
const MESSAGE_TEXT_MAX = 12000;

let schemaReady = false;

/**
 * Self-heal: таблица могла не появиться, если деплой API обошёл initDb/миграцию.
 * Без FK — у части ролей БД нет права REFERENCES.
 */
export async function ensureTelegramSendLogsSchema(): Promise<void> {
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS public.telegram_send_logs (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      batch_id UUID NOT NULL,
      channel VARCHAR(64) NOT NULL,
      trigger_source VARCHAR(32) NOT NULL,
      status VARCHAR(16) NOT NULL,
      recipient_type VARCHAR(32) NOT NULL,
      member_id INTEGER,
      member_name TEXT,
      telegram_chat_id TEXT,
      chat_title TEXT,
      scenario_id TEXT,
      kind TEXT,
      message_text TEXT NOT NULL DEFAULT '',
      error_code TEXT,
      error_description TEXT,
      http_status INTEGER,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_telegram_send_logs_created_desc
      ON public.telegram_send_logs (created_at DESC, id DESC)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_telegram_send_logs_batch
      ON public.telegram_send_logs (batch_id, created_at DESC, id DESC)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_telegram_send_logs_channel_created
      ON public.telegram_send_logs (channel, created_at DESC, id DESC)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_telegram_send_logs_status_created
      ON public.telegram_send_logs (status, created_at DESC, id DESC)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_telegram_send_logs_member
      ON public.telegram_send_logs (member_id, created_at DESC)
      WHERE member_id IS NOT NULL
  `);
  schemaReady = true;
}

function safeMeta(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function truncateMessage(text: string | null | undefined): string {
  const raw = typeof text === 'string' ? text : '';
  if (raw.length <= MESSAGE_TEXT_MAX) return raw;
  return `${raw.slice(0, MESSAGE_TEXT_MAX)}…`;
}

export function newTelegramSendBatchId(): string {
  return randomUUID();
}

export async function resolveTelegramChatTitle(chatId: string | null | undefined): Promise<string | null> {
  if (!pool || !chatId?.trim()) return null;
  try {
    const { rows } = await pool.query<{ title: string | null; username: string | null }>(
      `SELECT title, username
       FROM telegram_chats
       WHERE chat_id = $1
       LIMIT 1`,
      [chatId.trim()],
    );
    const row = rows[0];
    if (!row) return null;
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    if (title) return title;
    const username = typeof row.username === 'string' ? row.username.trim() : '';
    return username ? `@${username.replace(/^@/, '')}` : null;
  } catch {
    return null;
  }
}

export async function writeTelegramSendLog(input: WriteTelegramSendLogInput): Promise<void> {
  if (!pool) return;
  const batchId = input.batchId?.trim() || newTelegramSendBatchId();
  try {
    await ensureTelegramSendLogsSchema();
    await pool.query(
      `
        INSERT INTO public.telegram_send_logs (
          batch_id, channel, trigger_source, status, recipient_type,
          member_id, member_name, telegram_chat_id, chat_title,
          scenario_id, kind, message_text, error_code, error_description,
          http_status, meta
        )
        VALUES (
          $1::uuid, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13, $14,
          $15, $16::jsonb
        )
      `,
      [
        batchId,
        input.channel,
        input.trigger,
        input.status,
        input.recipientType,
        Number.isFinite(input.memberId) ? input.memberId : null,
        input.memberName?.trim() || null,
        input.telegramChatId?.trim() || null,
        input.chatTitle?.trim() || null,
        input.scenarioId?.trim() || null,
        input.kind?.trim() || null,
        truncateMessage(input.messageText),
        input.errorCode?.trim() || null,
        input.errorDescription?.trim()?.slice(0, 1000) || null,
        Number.isFinite(input.httpStatus) ? input.httpStatus : null,
        JSON.stringify(safeMeta(input.meta)),
      ],
    );
  } catch (err) {
    console.error('[telegram-send-log] write failed', err);
  }
}

async function cleanupLogTail(): Promise<number> {
  if (!pool) return 0;
  const result = await pool.query(
    `
      DELETE FROM public.telegram_send_logs
      WHERE id IN (
        SELECT id
        FROM public.telegram_send_logs
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
      DELETE FROM public.telegram_send_logs
      WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')
    `,
    [LOG_RETENTION_DAYS],
  );
  return result.rowCount ?? 0;
}

export async function runTelegramSendLogCleanup(): Promise<{
  deletedByRetention: number;
  deletedByLimit: number;
}> {
  await ensureTelegramSendLogsSchema();
  const deletedByRetention = await cleanupOldLogsByRetention();
  const deletedByLimit = await cleanupLogTail();
  return { deletedByRetention, deletedByLimit };
}

function parseChannel(raw: unknown): TelegramSendChannel | null {
  if (
    raw === 'prayer_dispatch' ||
    raw === 'service_plan_mailing' ||
    raw === 'service_plan_published' ||
    raw === 'coordinator_scenario' ||
    raw === 'manual' ||
    raw === 'password_reset'
  ) {
    return raw;
  }
  return null;
}

function parseStatus(raw: unknown): TelegramSendStatus | null {
  if (raw === 'ok' || raw === 'failed' || raw === 'skipped' || raw === 'blocked') return raw;
  return null;
}

function mapRow(row: Record<string, unknown>): TelegramSendLogRecord {
  return {
    id: Number(row.id),
    created_at: String(row.created_at ?? ''),
    batch_id: String(row.batch_id ?? ''),
    channel: row.channel as TelegramSendChannel,
    trigger_source: row.trigger_source as TelegramSendTrigger,
    status: row.status as TelegramSendStatus,
    recipient_type: row.recipient_type as TelegramRecipientType,
    member_id: row.member_id == null ? null : Number(row.member_id),
    member_name: typeof row.member_name === 'string' ? row.member_name : null,
    telegram_chat_id: typeof row.telegram_chat_id === 'string' ? row.telegram_chat_id : null,
    chat_title: typeof row.chat_title === 'string' ? row.chat_title : null,
    scenario_id: typeof row.scenario_id === 'string' ? row.scenario_id : null,
    kind: typeof row.kind === 'string' ? row.kind : null,
    message_text: typeof row.message_text === 'string' ? row.message_text : '',
    error_code: typeof row.error_code === 'string' ? row.error_code : null,
    error_description: typeof row.error_description === 'string' ? row.error_description : null,
    http_status: row.http_status == null ? null : Number(row.http_status),
    meta: safeMeta(row.meta),
  };
}

export async function listTelegramSendLogBatches(params?: {
  limit?: unknown;
  offset?: unknown;
  channel?: unknown;
  status?: unknown;
  search?: string;
}): Promise<TelegramSendBatchSummary[]> {
  if (!pool) return [];
  await ensureTelegramSendLogsSchema();

  const limit = Math.min(100, Math.max(1, Number(params?.limit ?? 40)));
  const offset = Math.max(0, Number(params?.offset ?? 0));
  const channel = parseChannel(params?.channel);
  const status = parseStatus(params?.status);
  const search = (params?.search ?? '').trim();

  // Берём с запасом строк и группируем в JS — надёжнее ARRAY_AGG/uuid[] на pooler.
  const fetchLimit = Math.min(2000, Math.max(200, limit * 40));

  const { rows } = await pool.query<Record<string, unknown>>(
    `
      SELECT
        id,
        created_at::text AS created_at,
        batch_id::text AS batch_id,
        channel,
        trigger_source,
        status,
        recipient_type,
        member_id,
        member_name,
        telegram_chat_id,
        chat_title,
        scenario_id,
        kind,
        message_text,
        error_code,
        error_description,
        http_status,
        meta
      FROM public.telegram_send_logs
      WHERE ($1::text IS NULL OR channel = $1::text)
        AND ($2::text IS NULL OR status = $2::text)
        AND (
          $3::text = ''
          OR COALESCE(member_name, '') ILIKE '%' || $3::text || '%'
          OR COALESCE(telegram_chat_id, '') ILIKE '%' || $3::text || '%'
          OR COALESCE(chat_title, '') ILIKE '%' || $3::text || '%'
          OR COALESCE(kind, '') ILIKE '%' || $3::text || '%'
          OR COALESCE(scenario_id, '') ILIKE '%' || $3::text || '%'
          OR COALESCE(message_text, '') ILIKE '%' || $3::text || '%'
          OR COALESCE(error_description, '') ILIKE '%' || $3::text || '%'
          OR channel ILIKE '%' || $3::text || '%'
        )
      ORDER BY created_at DESC, id DESC
      LIMIT $4
    `,
    [channel, status, search, fetchLimit],
  );

  const items = rows.map(mapRow);
  const batchOrder: string[] = [];
  const byBatch = new Map<string, TelegramSendLogRecord[]>();

  for (const item of items) {
    const list = byBatch.get(item.batch_id);
    if (!list) {
      byBatch.set(item.batch_id, [item]);
      batchOrder.push(item.batch_id);
    } else {
      list.push(item);
    }
  }

  const sliced = batchOrder.slice(offset, offset + limit);
  return sliced.map((batchId) => {
    const recipients = byBatch.get(batchId) ?? [];
    const head = recipients[0];
    const previewRaw = recipients.find((r) => r.message_text.trim())?.message_text.trim() || '';
    return {
      batch_id: batchId,
      channel: head?.channel ?? 'manual',
      trigger_source: head?.trigger_source ?? 'api',
      kind: head?.kind ?? null,
      scenario_id: head?.scenario_id ?? null,
      created_at: head?.created_at ?? '',
      total: recipients.length,
      ok_count: recipients.filter((r) => r.status === 'ok').length,
      failed_count: recipients.filter((r) => r.status === 'failed').length,
      blocked_count: recipients.filter((r) => r.status === 'blocked').length,
      skipped_count: recipients.filter((r) => r.status === 'skipped').length,
      preview_text: previewRaw.length > 280 ? `${previewRaw.slice(0, 280)}…` : previewRaw,
      recipients: recipients.map((r) => ({
        id: r.id,
        status: r.status,
        member_id: r.member_id,
        member_name: r.member_name,
        telegram_chat_id: r.telegram_chat_id,
        chat_title: r.chat_title,
        error_description: r.error_description,
        message_text: r.message_text,
        created_at: r.created_at,
      })),
    };
  });
}
