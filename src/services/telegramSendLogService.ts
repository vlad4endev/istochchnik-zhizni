import { randomUUID } from 'crypto';
import { pool } from '../config/db';

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
    await pool.query(
      `
        INSERT INTO telegram_send_logs (
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
      DELETE FROM telegram_send_logs
      WHERE id IN (
        SELECT id
        FROM telegram_send_logs
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
      DELETE FROM telegram_send_logs
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

export async function listTelegramSendLogBatches(params?: {
  limit?: unknown;
  offset?: unknown;
  channel?: unknown;
  status?: unknown;
  search?: string;
}): Promise<TelegramSendBatchSummary[]> {
  if (!pool) return [];
  const limit = Math.min(100, Math.max(1, Number(params?.limit ?? 40)));
  const offset = Math.max(0, Number(params?.offset ?? 0));
  const channel = parseChannel(params?.channel);
  const status = parseStatus(params?.status);
  const search = (params?.search ?? '').trim();

  const { rows: batchRows } = await pool.query<{
    batch_id: string;
    channel: TelegramSendChannel;
    trigger_source: TelegramSendTrigger;
    kind: string | null;
    scenario_id: string | null;
    created_at: string;
    total: string;
    ok_count: string;
    failed_count: string;
    blocked_count: string;
    skipped_count: string;
  }>(
    `
      SELECT
        batch_id,
        (ARRAY_AGG(channel ORDER BY created_at DESC, id DESC))[1] AS channel,
        (ARRAY_AGG(trigger_source ORDER BY created_at DESC, id DESC))[1] AS trigger_source,
        (ARRAY_AGG(kind ORDER BY created_at DESC, id DESC))[1] AS kind,
        (ARRAY_AGG(scenario_id ORDER BY created_at DESC, id DESC))[1] AS scenario_id,
        MAX(created_at)::text AS created_at,
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE status = 'ok')::text AS ok_count,
        COUNT(*) FILTER (WHERE status = 'failed')::text AS failed_count,
        COUNT(*) FILTER (WHERE status = 'blocked')::text AS blocked_count,
        COUNT(*) FILTER (WHERE status = 'skipped')::text AS skipped_count
      FROM telegram_send_logs
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
      GROUP BY batch_id
      ORDER BY MAX(created_at) DESC
      LIMIT $4
      OFFSET $5
    `,
    [channel, status, search, limit, offset],
  );

  if (batchRows.length === 0) return [];

  const batchIds = batchRows.map((r) => r.batch_id);
  const { rows: itemRows } = await pool.query<TelegramSendLogRecord>(
    `
      SELECT
        id, created_at::text, batch_id, channel, trigger_source, status, recipient_type,
        member_id, member_name, telegram_chat_id, chat_title, scenario_id, kind,
        message_text, error_code, error_description, http_status, meta
      FROM telegram_send_logs
      WHERE batch_id = ANY($1::uuid[])
      ORDER BY created_at DESC, id DESC
    `,
    [batchIds],
  );

  const byBatch = new Map<string, TelegramSendLogRecord[]>();
  for (const row of itemRows) {
    const list = byBatch.get(row.batch_id) ?? [];
    list.push({
      ...row,
      meta: safeMeta(row.meta),
    });
    byBatch.set(row.batch_id, list);
  }

  return batchRows.map((b) => {
    const recipients = byBatch.get(b.batch_id) ?? [];
    const preview =
      recipients.find((r) => r.message_text?.trim())?.message_text?.trim() ||
      '';
    return {
      batch_id: b.batch_id,
      channel: b.channel,
      trigger_source: b.trigger_source,
      kind: b.kind,
      scenario_id: b.scenario_id,
      created_at: b.created_at,
      total: Number(b.total) || 0,
      ok_count: Number(b.ok_count) || 0,
      failed_count: Number(b.failed_count) || 0,
      blocked_count: Number(b.blocked_count) || 0,
      skipped_count: Number(b.skipped_count) || 0,
      preview_text: preview.length > 280 ? `${preview.slice(0, 280)}…` : preview,
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
