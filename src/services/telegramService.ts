import { fetch as undiciFetch, ProxyAgent } from 'undici';

import { query } from '../config/db';
import { getMemberAssignmentsForWeek, getPrayerDataByDate, type PrayerPlanSections } from './calendarService';

export interface TelegramSettings {
  enabled: boolean;
  bot_token_masked: string | null;
  prayer_chat_id: string | null;
  coordinator_chat_id: string | null;
  default_chat_id: string | null;
  prayer_template: string | null;
  has_bot_token: boolean;
}

export interface TelegramDispatchRecipient {
  id: number;
  name: string;
  telegram_chat_id: string;
  telegram_delivery_blocked: boolean;
  telegram_delivery_block_reason: string | null;
  telegram_delivery_blocked_at: string | null;
}

export interface TelegramDispatchSettings {
  enabled: boolean;
  kind: 'daily' | 'once';
  time_hhmm: string | null;
  once_at_iso: string | null;
  /** Дата/время «разово» в часовом поясе сервера, формат ГГГГ-ММ-ДДTчч:мм (без смещения) */
  once_at_local: string | null;
  target: 'all' | 'selected';
  member_ids: number[];
  last_sent_at_iso: string | null;
  /** IANA-имя часового пояса процесса Node (как у сервера) */
  server_timezone: string;
  /** Человекочитаемая метка последней отправки в server_timezone */
  last_sent_label: string | null;
}

export interface TelegramDispatchSettingsUpdate {
  enabled?: boolean;
  kind?: 'daily' | 'once';
  time_hhmm?: string | null;
  once_at_iso?: string | null;
  /** Если задано, трактуется как локальное время сервера (ГГГГ-ММ-ДДTчч:мм), приоритет над once_at_iso */
  once_at_local?: string | null;
  target?: 'all' | 'selected';
  member_ids?: number[];
}

export interface TelegramSettingsUpdate {
  enabled?: boolean;
  bot_token?: string | null;
  prayer_chat_id?: string | null;
  coordinator_chat_id?: string | null;
  default_chat_id?: string | null;
  prayer_template?: string | null;
}

type TelegramPurpose = 'prayer' | 'coordinator' | 'default';

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function maskBotToken(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.length <= 10) return '********';
  return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
}

/** Bot tokens are ASCII; remove accidental spaces/newlines from paste */
function sanitizeBotTokenForHttp(botToken: string): string {
  return botToken.replace(/\s+/g, '').trim();
}

function isLikelyAbortError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  return (e as { name?: unknown }).name === 'AbortError';
}

const TELEGRAM_HTTP_RETRIES = 3;
const TELEGRAM_RETRY_DELAYS_MS = [400, 1000] as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Кратковременные сбои TCP/DNS/TLS — имеет смысл повторить запрос */
function isTransientTelegramFetchFailure(e: unknown): boolean {
  if (isLikelyAbortError(e) || (e instanceof Error && e.name === 'AbortError')) return false;
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    msg.includes('fetch failed') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('enotfound') ||
    msg.includes('getaddrinfo') ||
    msg.includes('ecanceled') ||
    msg.includes('epipe') ||
    msg.includes('eai_again') ||
    msg.includes('socket hang up') ||
    msg.includes('networkerror') ||
    msg.includes('connection reset') ||
    msg.includes('reset by peer')
  );
}

/** Только для Telegram API: TELEGRAM_HTTPS_PROXY приоритетнее HTTPS_PROXY/HTTP_PROXY */
let telegramProxyAgent: ProxyAgent | null | undefined;

function getTelegramProxyAgent(): ProxyAgent | undefined {
  if (telegramProxyAgent !== undefined) return telegramProxyAgent ?? undefined;
  const u =
    normalizeOptionalString(process.env.TELEGRAM_HTTPS_PROXY) ??
    normalizeOptionalString(process.env.HTTPS_PROXY) ??
    normalizeOptionalString(process.env.HTTP_PROXY);
  telegramProxyAgent = u ? new ProxyAgent(u) : null;
  if (telegramProxyAgent) {
    console.info('[telegram] using outbound HTTPS proxy for api.telegram.org');
  }
  return telegramProxyAgent ?? undefined;
}

async function fetchTelegramHttp(url: string, init: RequestInit): Promise<Response> {
  const dispatcher = getTelegramProxyAgent();
  const initWithProxy = dispatcher ? { ...init, dispatcher } : init;
  let last: unknown;
  for (let attempt = 0; attempt < TELEGRAM_HTTP_RETRIES; attempt++) {
    try {
      return (await undiciFetch(url, initWithProxy as Parameters<typeof undiciFetch>[1])) as unknown as Response;
    } catch (e) {
      last = e;
      const canRetry = attempt < TELEGRAM_HTTP_RETRIES - 1 && isTransientTelegramFetchFailure(e);
      if (canRetry) {
        console.warn(`[telegram] HTTP fetch retry ${attempt + 2}/${TELEGRAM_HTTP_RETRIES}`, e);
        await delay(TELEGRAM_RETRY_DELAYS_MS[attempt] ?? 1200);
        continue;
      }
      throw e;
    }
  }
  throw last;
}

/** Base URL `https://api.telegram.org/bot<token>` without trailing slash; never throws URIError */
function telegramApiBaseForBot(botToken: string): string {
  const t = sanitizeBotTokenForHttp(botToken);
  let encoded: string;
  try {
    encoded = encodeURIComponent(t);
  } catch {
    const ascii = [...t]
      .filter((ch) => {
        const cp = ch.codePointAt(0) ?? 0;
        return cp >= 0x21 && cp <= 0x7e;
      })
      .join('');
    if (!ascii) {
      throw new Error('telegram_bot_token_invalid_chars');
    }
    encoded = encodeURIComponent(ascii);
  }
  return `https://api.telegram.org/bot${encoded}`;
}

function getServerIANATimezone(): string {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof z === 'string' && z.trim().length > 0) return z.trim();
  } catch {
    /* ignore */
  }
  const tz = normalizeOptionalString(process.env.TZ);
  return tz ?? 'UTC';
}

/** UTC instant → локальные компоненты сервера в виде ГГГГ-ММ-ДДTчч:мм */
function isoInstantToServerLocalDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${day}T${h}:${mi}`;
}

/** Локальное время сервера (стена часов) → ISO UTC для TIMESTAMPTZ */
function parseServerLocalDateTimeToIso(ymdhm: string): string | null {
  const t = ymdhm.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  if (![y, mo, d, h, mi].every((x) => Number.isInteger(x))) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const dt = new Date(y, mo - 1, d, h, mi, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt.toISOString();
}

function formatInstantInServerTimezone(iso: string | null, tz: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: tz,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return isoInstantToServerLocalDateTime(iso);
  }
}

async function ensureSettingsColumns(): Promise<void> {
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT');
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_prayer_chat_id TEXT');
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_coordinator_chat_id TEXT');
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_default_chat_id TEXT');
  await query(
    'ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_enabled BOOLEAN NOT NULL DEFAULT FALSE',
  );
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_prayer_template TEXT');
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_dispatch_enabled BOOLEAN NOT NULL DEFAULT FALSE');
  await query("ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_dispatch_kind VARCHAR(16) NOT NULL DEFAULT 'daily'");
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_dispatch_time VARCHAR(5)');
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_dispatch_once_at TIMESTAMPTZ');
  await query("ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_dispatch_target VARCHAR(16) NOT NULL DEFAULT 'all'");
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_dispatch_member_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[]');
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_dispatch_last_sent_at TIMESTAMPTZ');
}

async function ensureMembersTelegramColumn(): Promise<void> {
  await query('ALTER TABLE members ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(64)');
  await query('ALTER TABLE members ADD COLUMN IF NOT EXISTS telegram_delivery_blocked BOOLEAN NOT NULL DEFAULT FALSE');
  await query('ALTER TABLE members ADD COLUMN IF NOT EXISTS telegram_delivery_block_reason TEXT');
  await query('ALTER TABLE members ADD COLUMN IF NOT EXISTS telegram_delivery_blocked_at TIMESTAMPTZ');
}

async function readSettingsRow(): Promise<{
  telegram_enabled: boolean;
  telegram_bot_token: string | null;
  telegram_prayer_chat_id: string | null;
  telegram_coordinator_chat_id: string | null;
  telegram_default_chat_id: string | null;
  telegram_prayer_template: string | null;
  telegram_dispatch_enabled: boolean;
  telegram_dispatch_kind: 'daily' | 'once';
  telegram_dispatch_time: string | null;
  telegram_dispatch_once_at: string | null;
  telegram_dispatch_target: 'all' | 'selected';
  telegram_dispatch_member_ids: number[];
  telegram_dispatch_last_sent_at: string | null;
}> {
  await ensureSettingsColumns();
  await query(
    `INSERT INTO global_settings (id, start_date)
     VALUES (1, CURRENT_DATE)
     ON CONFLICT (id) DO NOTHING`,
  );
  const result = await query(
    `SELECT
       telegram_enabled,
       telegram_bot_token,
       telegram_prayer_chat_id,
       telegram_coordinator_chat_id,
       telegram_default_chat_id,
       telegram_prayer_template,
       telegram_dispatch_enabled,
       telegram_dispatch_kind,
       telegram_dispatch_time,
       telegram_dispatch_once_at::text,
       telegram_dispatch_target,
       telegram_dispatch_member_ids,
       telegram_dispatch_last_sent_at::text
     FROM global_settings
     WHERE id = 1`,
  );
  const row = result.rows[0] as
    | {
        telegram_enabled?: boolean;
        telegram_bot_token?: string | null;
        telegram_prayer_chat_id?: string | null;
        telegram_coordinator_chat_id?: string | null;
        telegram_default_chat_id?: string | null;
        telegram_prayer_template?: string | null;
        telegram_dispatch_enabled?: boolean;
        telegram_dispatch_kind?: unknown;
        telegram_dispatch_time?: string | null;
        telegram_dispatch_once_at?: string | null;
        telegram_dispatch_target?: unknown;
        telegram_dispatch_member_ids?: unknown;
        telegram_dispatch_last_sent_at?: string | null;
      }
    | undefined;
  return {
    telegram_enabled: Boolean(row?.telegram_enabled),
    telegram_bot_token: normalizeOptionalString(row?.telegram_bot_token),
    telegram_prayer_chat_id: normalizeOptionalString(row?.telegram_prayer_chat_id),
    telegram_coordinator_chat_id: normalizeOptionalString(row?.telegram_coordinator_chat_id),
    telegram_default_chat_id: normalizeOptionalString(row?.telegram_default_chat_id),
    telegram_prayer_template: normalizeOptionalString(row?.telegram_prayer_template),
    telegram_dispatch_enabled: Boolean(row?.telegram_dispatch_enabled),
    telegram_dispatch_kind: row?.telegram_dispatch_kind === 'once' ? 'once' : 'daily',
    telegram_dispatch_time: normalizeOptionalString(row?.telegram_dispatch_time),
    telegram_dispatch_once_at: normalizeOptionalString(row?.telegram_dispatch_once_at),
    telegram_dispatch_target: row?.telegram_dispatch_target === 'selected' ? 'selected' : 'all',
    telegram_dispatch_member_ids: Array.isArray(row?.telegram_dispatch_member_ids)
      ? row.telegram_dispatch_member_ids
          .map((x) => Number(x))
          .filter((x) => Number.isInteger(x) && x > 0)
      : [],
    telegram_dispatch_last_sent_at: normalizeOptionalString(row?.telegram_dispatch_last_sent_at),
  };
}

export async function getTelegramSettings(): Promise<TelegramSettings> {
  const row = await readSettingsRow();
  const envToken = normalizeOptionalString(process.env.TELEGRAM_BOT_TOKEN);
  const botToken = row.telegram_bot_token ?? envToken;
  return {
    enabled: row.telegram_enabled,
    bot_token_masked: maskBotToken(botToken),
    prayer_chat_id: row.telegram_prayer_chat_id,
    coordinator_chat_id: row.telegram_coordinator_chat_id,
    default_chat_id: row.telegram_default_chat_id,
    prayer_template: row.telegram_prayer_template,
    has_bot_token: Boolean(botToken),
  };
}

export async function updateTelegramSettings(input: TelegramSettingsUpdate): Promise<TelegramSettings> {
  await ensureSettingsColumns();
  const current = await readSettingsRow();
  const next = {
    telegram_enabled: typeof input.enabled === 'boolean' ? input.enabled : current.telegram_enabled,
    telegram_bot_token:
      input.bot_token !== undefined
        ? input.bot_token === null
          ? null
          : normalizeOptionalString(sanitizeBotTokenForHttp(String(input.bot_token)))
        : current.telegram_bot_token,
    telegram_prayer_chat_id:
      input.prayer_chat_id !== undefined
        ? normalizeOptionalString(input.prayer_chat_id)
        : current.telegram_prayer_chat_id,
    telegram_coordinator_chat_id:
      input.coordinator_chat_id !== undefined
        ? normalizeOptionalString(input.coordinator_chat_id)
        : current.telegram_coordinator_chat_id,
    telegram_default_chat_id:
      input.default_chat_id !== undefined
        ? normalizeOptionalString(input.default_chat_id)
        : current.telegram_default_chat_id,
    telegram_prayer_template:
      input.prayer_template !== undefined
        ? normalizeOptionalString(input.prayer_template)
        : current.telegram_prayer_template,
  };

  await query(
    `INSERT INTO global_settings (
       id,
       start_date,
       telegram_enabled,
       telegram_bot_token,
       telegram_prayer_chat_id,
       telegram_coordinator_chat_id,
       telegram_default_chat_id,
       telegram_prayer_template
     )
     VALUES (1, CURRENT_DATE, $1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE
     SET
       telegram_enabled = EXCLUDED.telegram_enabled,
       telegram_bot_token = EXCLUDED.telegram_bot_token,
       telegram_prayer_chat_id = EXCLUDED.telegram_prayer_chat_id,
       telegram_coordinator_chat_id = EXCLUDED.telegram_coordinator_chat_id,
       telegram_default_chat_id = EXCLUDED.telegram_default_chat_id,
       telegram_prayer_template = EXCLUDED.telegram_prayer_template`,
    [
      next.telegram_enabled,
      next.telegram_bot_token,
      next.telegram_prayer_chat_id,
      next.telegram_coordinator_chat_id,
      next.telegram_default_chat_id,
      next.telegram_prayer_template,
    ],
  );
  return getTelegramSettings();
}

export async function getTelegramDispatchSettings(): Promise<TelegramDispatchSettings> {
  const row = await readSettingsRow();
  const tz = getServerIANATimezone();
  const onceIso = row.telegram_dispatch_once_at;
  return {
    enabled: row.telegram_dispatch_enabled,
    kind: row.telegram_dispatch_kind,
    time_hhmm: row.telegram_dispatch_time,
    once_at_iso: onceIso,
    once_at_local: isoInstantToServerLocalDateTime(onceIso),
    target: row.telegram_dispatch_target,
    member_ids: row.telegram_dispatch_member_ids,
    last_sent_at_iso: row.telegram_dispatch_last_sent_at,
    server_timezone: tz,
    last_sent_label: formatInstantInServerTimezone(row.telegram_dispatch_last_sent_at, tz),
  };
}

export async function updateTelegramDispatchSettings(input: TelegramDispatchSettingsUpdate): Promise<TelegramDispatchSettings> {
  await ensureSettingsColumns();
  const current = await readSettingsRow();
  const nextKind = input.kind ?? current.telegram_dispatch_kind;
  const nextTarget = input.target ?? current.telegram_dispatch_target;
  const nextMemberIds =
    input.member_ids !== undefined
      ? Array.from(new Set(input.member_ids.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0)))
      : current.telegram_dispatch_member_ids;
  const nextTime = input.time_hhmm !== undefined ? normalizeOptionalString(input.time_hhmm) : current.telegram_dispatch_time;

  let nextOnceAt = current.telegram_dispatch_once_at;
  if (input.once_at_local !== undefined) {
    const raw = normalizeOptionalString(input.once_at_local);
    if (raw === null) {
      nextOnceAt = null;
    } else {
      const parsed = parseServerLocalDateTimeToIso(raw);
      if (!parsed) {
        throw new Error('telegram_once_at_invalid');
      }
      nextOnceAt = parsed;
    }
  } else if (input.once_at_iso !== undefined) {
    nextOnceAt = normalizeOptionalString(input.once_at_iso);
  }

  await query(
    `INSERT INTO global_settings (
       id, start_date, telegram_dispatch_enabled, telegram_dispatch_kind, telegram_dispatch_time,
       telegram_dispatch_once_at, telegram_dispatch_target, telegram_dispatch_member_ids
     )
     VALUES (1, CURRENT_DATE, $1, $2, $3, $4::timestamptz, $5, $6::int[])
     ON CONFLICT (id) DO UPDATE
     SET
       telegram_dispatch_enabled = EXCLUDED.telegram_dispatch_enabled,
       telegram_dispatch_kind = EXCLUDED.telegram_dispatch_kind,
       telegram_dispatch_time = EXCLUDED.telegram_dispatch_time,
       telegram_dispatch_once_at = EXCLUDED.telegram_dispatch_once_at,
       telegram_dispatch_target = EXCLUDED.telegram_dispatch_target,
       telegram_dispatch_member_ids = EXCLUDED.telegram_dispatch_member_ids`,
    [
      typeof input.enabled === 'boolean' ? input.enabled : current.telegram_dispatch_enabled,
      nextKind,
      nextKind === 'daily' ? nextTime : null,
      nextKind === 'once' ? nextOnceAt : null,
      nextTarget,
      nextTarget === 'selected' ? nextMemberIds : [],
    ],
  );
  return getTelegramDispatchSettings();
}

async function resolveTelegramConfig(): Promise<{
  enabled: boolean;
  botToken: string | null;
  prayerChatId: string | null;
  coordinatorChatId: string | null;
  defaultChatId: string | null;
}> {
  const row = await readSettingsRow();
  const rawToken = row.telegram_bot_token ?? normalizeOptionalString(process.env.TELEGRAM_BOT_TOKEN);
  const botToken = rawToken ? sanitizeBotTokenForHttp(rawToken) : null;
  return {
    enabled: row.telegram_enabled,
    botToken: botToken && botToken.length > 0 ? botToken : null,
    prayerChatId: row.telegram_prayer_chat_id,
    coordinatorChatId: row.telegram_coordinator_chat_id,
    defaultChatId: row.telegram_default_chat_id,
  };
}

function resolveChatId(
  purpose: TelegramPurpose,
  cfg: { prayerChatId: string | null; coordinatorChatId: string | null; defaultChatId: string | null },
): string | null {
  if (purpose === 'prayer') {
    return cfg.prayerChatId ?? cfg.defaultChatId;
  }
  if (purpose === 'coordinator') {
    return cfg.coordinatorChatId ?? cfg.defaultChatId;
  }
  return cfg.defaultChatId;
}

/** Лимит Telegram Bot API для поля `text` в sendMessage (символы UTF-16, как в String.length). */
const TELEGRAM_BOT_MESSAGE_MAX_LENGTH = 4096;

function truncateUtf16Safe(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  let t = s.slice(0, maxLen);
  const last = t.charCodeAt(t.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) {
    t = t.slice(0, -1);
  }
  return t;
}

/**
 * Разбивает текст на части не длиннее maxLen — для рассылки «молитва на сегодня» и длинных шаблонов.
 * Рвём по абзацам/строкам/пробелам, чтобы читабельность сохранялась.
 */
export function splitTextForTelegramDispatch(text: string, maxLen = TELEGRAM_BOT_MESSAGE_MAX_LENGTH): string[] {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n');
  if (normalized.length === 0) return [];
  const chunks: string[] = [];
  let cursor = 0;
  const minBreak = Math.max(120, Math.floor(maxLen * 0.35));
  while (cursor < normalized.length) {
    const hardEnd = Math.min(cursor + maxLen, normalized.length);
    if (hardEnd >= normalized.length) {
      const tail = truncateUtf16Safe(normalized.slice(cursor), maxLen);
      if (tail.length > 0) chunks.push(tail);
      break;
    }
    const slice = normalized.slice(cursor, hardEnd);
    const relNN = slice.lastIndexOf('\n\n');
    const relN = slice.lastIndexOf('\n');
    const relS = slice.lastIndexOf(' ');
    let end = hardEnd;
    if (relNN >= minBreak) {
      end = cursor + relNN + 2;
    } else if (relN >= minBreak) {
      end = cursor + relN + 1;
    } else if (relS >= minBreak) {
      end = cursor + relS + 1;
    }
    if (end <= cursor) {
      end = hardEnd;
    }
    let piece = normalized.slice(cursor, end);
    piece = truncateUtf16Safe(piece, maxLen);
    if (piece.length > 0) chunks.push(piece);
    cursor = end;
    while (cursor < normalized.length && (normalized[cursor] === '\n' || normalized[cursor] === ' ')) {
      cursor += 1;
    }
  }
  return chunks;
}

async function sendTelegramMessageRaw(botToken: string, chatId: string, text: string): Promise<{
  ok: boolean;
  status: number;
  body: { description?: unknown; ok?: unknown } | null;
}> {
  const chat = normalizeOptionalString(chatId);
  if (!chat) {
    throw new Error('telegram_missing_chat');
  }
  if (text.length > TELEGRAM_BOT_MESSAGE_MAX_LENGTH) {
    throw new Error('telegram_message_text_too_long_internal');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const endpoint = `${telegramApiBaseForBot(botToken)}/sendMessage`;
    const response = await fetchTelegramHttp(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        chat_id: chat,
        text,
        disable_web_page_preview: true,
      }),
    });
    let body: unknown = null;
    try {
      body = (await response.json()) as unknown;
    } catch {
      body = null;
    }
    const bodyObj =
      body && typeof body === 'object' ? (body as { description?: unknown; ok?: unknown }) : null;
    const telegramAccepted = bodyObj?.ok === true;
    return {
      ok: response.ok && telegramAccepted,
      status: response.status,
      body: bodyObj,
    };
  } catch (e) {
    if (e instanceof Error && e.message === 'telegram_missing_chat') throw e;
    if (e instanceof Error && e.message === 'telegram_bot_token_invalid_chars') throw e;
    if (isLikelyAbortError(e) || (e instanceof Error && e.name === 'AbortError')) {
      throw new Error('telegram_connection_timeout');
    }
    const detail = e instanceof Error ? e.message : String(e);
    const safe = detail.length > 400 ? `${detail.slice(0, 400)}…` : detail;
    throw new Error(`telegram_send_failed:0:${safe}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function sendTelegramMessageRawSequence(botToken: string, chatId: string, text: string): Promise<{
  ok: boolean;
  status: number;
  body: { description?: unknown; ok?: unknown } | null;
}> {
  const parts = splitTextForTelegramDispatch(text.trim());
  if (parts.length === 0) {
    throw new Error('telegram_empty_text');
  }
  let last: Awaited<ReturnType<typeof sendTelegramMessageRaw>> = {
    ok: false,
    status: 0,
    body: null,
  };
  for (const part of parts) {
    if (part.length > TELEGRAM_BOT_MESSAGE_MAX_LENGTH) {
      throw new Error('telegram_message_text_too_long_internal');
    }
    last = await sendTelegramMessageRaw(botToken, chatId, part);
    if (!last.ok) {
      return last;
    }
  }
  return last;
}

export interface TelegramGetMeResult {
  id: number;
  is_bot: boolean;
  username: string | null;
  first_name: string | null;
}

async function fetchTelegramGetMeRaw(botToken: string): Promise<{
  ok: boolean;
  status: number;
  body: { ok?: unknown; result?: unknown; description?: unknown } | null;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const endpoint = `${telegramApiBaseForBot(botToken)}/getMe`;
    const response = await fetchTelegramHttp(endpoint, { method: 'GET', signal: controller.signal });
    let body: unknown = null;
    try {
      body = (await response.json()) as unknown;
    } catch {
      body = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      body: (body && typeof body === 'object' ? (body as { ok?: unknown; result?: unknown; description?: unknown }) : null),
    };
  } catch (e) {
    if (e instanceof Error && e.message === 'telegram_bot_token_invalid_chars') {
      throw e;
    }
    if (isLikelyAbortError(e) || (e instanceof Error && e.name === 'AbortError')) {
      throw new Error('telegram_connection_timeout');
    }
    let detail = e instanceof Error ? e.message : String(e);
    const errWithCause = e instanceof Error ? (e as Error & { cause?: unknown }) : null;
    const c = errWithCause?.cause;
    if (c instanceof Error) {
      detail = `${detail} (${c.message})`;
    } else if (c !== undefined && c !== null) {
      detail = `${detail} (${String(c)})`;
    }
    const safe = detail.length > 400 ? `${detail.slice(0, 400)}…` : detail;
    throw new Error(`telegram_getme_network:${safe}`);
  } finally {
    clearTimeout(timeout);
  }
}

/** Проверка токена через Telegram getMe. Опционально передать токен из формы до сохранения в БД. */
export async function testTelegramBotConnection(botTokenFromRequest?: string): Promise<TelegramGetMeResult> {
  let row: Awaited<ReturnType<typeof readSettingsRow>>;
  try {
    row = await readSettingsRow();
  } catch (e) {
    console.error('[telegram] testTelegramBotConnection: readSettingsRow failed', e);
    throw new Error('telegram_settings_read');
  }
  const override = normalizeOptionalString(botTokenFromRequest);
  const rawToken = override ?? row.telegram_bot_token ?? normalizeOptionalString(process.env.TELEGRAM_BOT_TOKEN);
  if (!rawToken) {
    throw new Error('telegram_missing_token');
  }
  const token = sanitizeBotTokenForHttp(rawToken);
  if (!token) {
    throw new Error('telegram_missing_token');
  }
  const raw = await fetchTelegramGetMeRaw(token);
  if (!raw.ok || raw.body?.ok !== true) {
    const description =
      typeof raw.body?.description === 'string' ? raw.body.description.trim() : '';
    throw new Error(
      description ? `telegram_getme_failed:${raw.status}:${description}` : `telegram_getme_failed:${raw.status}`,
    );
  }
  const result = raw.body.result;
  if (!result || typeof result !== 'object') {
    throw new Error('telegram_getme_failed:0:invalid_response');
  }
  const r = result as Record<string, unknown>;
  const id = Number(r.id);
  if (!Number.isInteger(id)) {
    throw new Error('telegram_getme_failed:0:invalid_response');
  }
  return {
    id,
    is_bot: Boolean(r.is_bot),
    username: typeof r.username === 'string' ? r.username : null,
    first_name: typeof r.first_name === 'string' ? r.first_name : null,
  };
}

async function listMemberTelegramChatIds(): Promise<string[]> {
  await ensureMembersTelegramColumn();
  const result = await query(
    `SELECT DISTINCT telegram_chat_id
     FROM members
     WHERE is_active = TRUE
       AND COALESCE(telegram_delivery_blocked, FALSE) = FALSE
       AND NULLIF(TRIM(COALESCE(telegram_chat_id, '')), '') IS NOT NULL`,
  );
  return result.rows
    .map((row) => normalizeOptionalString((row as { telegram_chat_id?: unknown }).telegram_chat_id))
    .filter((id): id is string => Boolean(id));
}

export async function listTelegramDispatchRecipients(): Promise<TelegramDispatchRecipient[]> {
  await ensureMembersTelegramColumn();
  const result = await query(
    `SELECT
       id,
       COALESCE(
         NULLIF(trim(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))), ''),
         NULLIF(trim(name), ''),
         CONCAT('#', id::text)
       ) AS display_name,
       trim(telegram_chat_id) AS telegram_chat_id,
       COALESCE(telegram_delivery_blocked, FALSE) AS telegram_delivery_blocked,
       telegram_delivery_block_reason,
       telegram_delivery_blocked_at::text AS telegram_delivery_blocked_at
     FROM members
     WHERE is_active = TRUE
       AND COALESCE(telegram_delivery_blocked, FALSE) = FALSE
       AND NULLIF(trim(COALESCE(telegram_chat_id, '')), '') IS NOT NULL
     ORDER BY display_name ASC`,
  );
  return result.rows.map((r) => ({
    id: Number((r as { id: unknown }).id),
    name: String((r as { display_name: unknown }).display_name),
    telegram_chat_id: String((r as { telegram_chat_id: unknown }).telegram_chat_id),
    telegram_delivery_blocked: Boolean((r as { telegram_delivery_blocked?: unknown }).telegram_delivery_blocked),
    telegram_delivery_block_reason:
      typeof (r as { telegram_delivery_block_reason?: unknown }).telegram_delivery_block_reason === 'string'
        ? String((r as { telegram_delivery_block_reason: string }).telegram_delivery_block_reason)
        : null,
    telegram_delivery_blocked_at:
      typeof (r as { telegram_delivery_blocked_at?: unknown }).telegram_delivery_blocked_at === 'string'
        ? String((r as { telegram_delivery_blocked_at: string }).telegram_delivery_blocked_at)
        : null,
  }));
}

function extractTelegramFailureDescription(
  result: Awaited<ReturnType<typeof sendTelegramMessageRawSequence>>,
): string {
  return typeof result.body?.description === 'string' ? result.body.description.trim() : '';
}

function isTelegramUserDeactivatedFailure(
  result: Awaited<ReturnType<typeof sendTelegramMessageRawSequence>>,
): boolean {
  if (result.status !== 403) return false;
  const d = extractTelegramFailureDescription(result).toLowerCase();
  return d.includes('user is deactivated');
}

async function markMemberTelegramDeliveryBlocked(chatId: string, reason: string): Promise<void> {
  const trimmed = normalizeOptionalString(chatId);
  if (!trimmed) return;
  await ensureMembersTelegramColumn();
  await query(
    `UPDATE members
     SET telegram_delivery_blocked = TRUE,
         telegram_delivery_block_reason = $2,
         telegram_delivery_blocked_at = NOW(),
         updated_at = NOW()
     WHERE NULLIF(TRIM(COALESCE(telegram_chat_id, '')), '') = $1`,
    [trimmed, reason.slice(0, 500)],
  );
}

function formatDateRuYmd(dateYmd: string): string {
  const d = new Date(`${dateYmd}T00:00:00.000Z`);
  const formatted = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(d);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/** Календарный день в локальном времени процесса Node (как «сегодня» в cron рассылки). */
function formatYmdServerLocal(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isValidCalendarYmd(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Дата для текста «Молитва на сегодня»: явный YYYY-MM-DD или локальный «сегодня» сервера. */
export function resolvePrayerDispatchCalendarYmd(prayerDateYmd?: string | null): string {
  const trimmed = typeof prayerDateYmd === 'string' ? prayerDateYmd.trim() : '';
  if (!trimmed) {
    return formatYmdServerLocal(new Date());
  }
  if (!isValidCalendarYmd(trimmed)) {
    throw new Error('telegram_prayer_date_invalid');
  }
  return trimmed;
}

const DEFAULT_TODAY_PRAYER_TEMPLATE = [
  'Сегодня {{date}} мы молимся за члена церкви:',
  '',
  '📌 {{member_name}}',
  'просит молиться:',
  '{{member_prayer_request_bullets}}',
  '',
  '{{all_themes_block}}',
  '',
  '{{all_ministries_block}}',
  '',
  '📍Молитва за отпавших: {{all_backsliders_inline}}',
].join('\n');

function safeTemplateValue(value: string | null | undefined, fallback: string): string {
  const normalized = normalizeOptionalString(value);
  return normalized ?? fallback;
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, key: string) => vars[key] ?? '');
}

function splitMeaningfulLines(raw: string | null | undefined): string[] {
  const src = safeTemplateValue(raw, '');
  if (!src) return [];
  return src
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function normalizePrayerPointText(point: string, isLast: boolean): string {
  const base = point.replace(/^-+\s*/, '').trim().replace(/[;,.!?]+$/g, '').trim();
  if (!base) return isLast ? 'Не указано.' : 'Не указано;';
  return `${base}${isLast ? '.' : ';'}`;
}

function ensureBulletedLines(lines: string[], fallback: string): string {
  if (lines.length === 0) {
    return `- ${normalizePrayerPointText(fallback, true)}`;
  }
  return lines.map((line, index) => `- ${normalizePrayerPointText(line, index === lines.length - 1)}`).join('\n');
}

function formatThemeBlock(theme: PrayerPlanSections['global_themes'][number]): string {
  const title = safeTemplateValue(theme.title, 'ТЕМА НЕ УКАЗАНА').toUpperCase();
  const verse = safeTemplateValue(theme.bible_verse, 'Стих не указан');
  const points = ensureBulletedLines(splitMeaningfulLines(theme.prayer_points), 'Пункты молитвы не указаны');
  return [`- ${title}`, `📖 ${verse}`, '🙏', points].join('\n');
}

function formatMinistryBlock(ministry: PrayerPlanSections['ministries'][number]): string {
  const title = safeTemplateValue(ministry.title, 'Служение');
  const points = splitMeaningfulLines(ministry.prayer_points);
  if (points.length === 0) {
    return `🛠️ Молимся за ${title}: - ${normalizePrayerPointText('Нужды служения не указаны', true)}`;
  }
  if (points.length === 1) {
    return `🛠️ Молимся за ${title}: - ${normalizePrayerPointText(points[0], true)}`;
  }
  return [
    `🛠️ Молимся за ${title}:`,
    ...points.map((point, index) => `- ${normalizePrayerPointText(point, index === points.length - 1)}`),
  ].join('\n');
}

function joinBlocks(blocks: string[], emptyFallback: string): string {
  if (blocks.length === 0) return emptyFallback;
  return blocks.join('\n\n');
}

export async function buildTodayPrayerTelegramText(prayerDateYmd?: string | null): Promise<string> {
  const today = resolvePrayerDispatchCalendarYmd(prayerDateYmd);
  const [data, settings] = await Promise.all([getPrayerDataByDate(today), readSettingsRow()]);
  const member = data.members[0];
  const theme = data.global_themes[0];
  const ministry = data.ministries[0];
  const backslider = data.backsliders[0];
  const template =
    normalizeOptionalString(settings.telegram_prayer_template) ?? DEFAULT_TODAY_PRAYER_TEMPLATE;
  const allThemesBlock = joinBlocks(
    data.global_themes.map((item) => formatThemeBlock(item)),
    '- ТЕМЫ МОЛИТВЫ НЕ УКАЗАНЫ',
  );
  const allMinistriesBlock = joinBlocks(
    data.ministries.map((item) => formatMinistryBlock(item)),
    '🛠️ Молимся за служения: - не указаны',
  );
  const allBackslidersInline =
    data.backsliders.length > 0
      ? data.backsliders
          .map((item) => safeTemplateValue(item.name, '').trim())
          .filter((name) => name.length > 0)
          .join(', ')
      : 'не указаны';
  const memberPrayerBullets = ensureBulletedLines(
    splitMeaningfulLines(member?.prayer_request),
    'Нужда не указана',
  );
  return renderTemplate(template, {
    date: formatDateRuYmd(today),
    member_name: safeTemplateValue(member?.name, 'Не назначен'),
    member_prayer_request: safeTemplateValue(member?.prayer_request, 'Не указана'),
    member_prayer_request_bullets: memberPrayerBullets,
    theme_title: safeTemplateValue(theme?.title, 'Не указана'),
    theme_bible_verse: safeTemplateValue(theme?.bible_verse, 'Не указан'),
    theme_prayer_points: safeTemplateValue(theme?.prayer_points, 'Не указаны'),
    ministry_title: safeTemplateValue(ministry?.title, 'Не указано'),
    ministry_prayer_points: safeTemplateValue(ministry?.prayer_points, 'Не указан'),
    backslider_name: safeTemplateValue(backslider?.name, 'Не указан'),
    all_themes_block: allThemesBlock,
    all_ministries_block: allMinistriesBlock,
    all_backsliders_inline: allBackslidersInline,
  }).trim();
}

export async function buildNextWeekPlanTelegramText(): Promise<string> {
  const [days, coordinatorsRes] = await Promise.all([
    getMemberAssignmentsForWeek('next'),
    query(
      `SELECT
         COALESCE(
           NULLIF(trim(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))), ''),
           NULLIF(trim(name), ''),
           CONCAT('#', id::text)
         ) AS display_name
       FROM members
       WHERE is_active = TRUE AND is_collection_coordinator = TRUE
       ORDER BY display_name ASC`,
    ),
  ]);

  const lines = ['Список участников на следующую неделю', ''];
  for (const item of days) {
    const day = formatDateRuYmd(item.date);
    const member = item.member?.name ?? 'Не назначен';
    lines.push(`- ${day}: ${member}`);
  }

  const coordinators = coordinatorsRes.rows
    .map((r) => (typeof (r as { display_name?: unknown }).display_name === 'string'
      ? (r as { display_name: string }).display_name.trim()
      : ''))
    .filter((x) => x.length > 0);

  lines.push('');
  lines.push(
    coordinators.length > 0
      ? `Ответственные за сбор: ${coordinators.join(', ')}`
      : 'Ответственные за сбор не назначены',
  );
  return lines.join('\n');
}

export async function sendTelegramByPurpose(args: {
  purpose: TelegramPurpose;
  text: string;
  chatIdOverride?: string | null;
}): Promise<{ chat_id: string; status: number }> {
  const cfg = await resolveTelegramConfig();
  if (!cfg.enabled) {
    throw new Error('telegram_disabled');
  }
  if (!cfg.botToken) {
    throw new Error('telegram_missing_token');
  }
  const chatId = normalizeOptionalString(args.chatIdOverride) ?? resolveChatId(args.purpose, cfg);
  if (!chatId) {
    throw new Error('telegram_missing_chat');
  }
  const text = args.text.trim();
  if (!text) {
    throw new Error('telegram_empty_text');
  }
  const sent = await sendTelegramMessageRawSequence(cfg.botToken, chatId, text);
  if (!sent.ok) {
    const description =
      typeof sent.body?.description === 'string' ? sent.body.description.trim() : '';
    throw new Error(
      description ? `telegram_send_failed:${sent.status}:${description}` : `telegram_send_failed:${sent.status}`,
    );
  }
  return { chat_id: chatId, status: sent.status };
}

export async function sendTodayPrayerTelegramToAllMembers(
  prayerDateYmd?: string | null,
): Promise<{ sent_count: number; total: number }> {
  const cfg = await resolveTelegramConfig();
  if (!cfg.enabled) {
    throw new Error('telegram_disabled');
  }
  if (!cfg.botToken) {
    throw new Error('telegram_missing_token');
  }

  const [text, chatIds] = await Promise.all([
    buildTodayPrayerTelegramText(prayerDateYmd),
    listMemberTelegramChatIds(),
  ]);
  if (chatIds.length === 0) {
    throw new Error('telegram_missing_member_chats');
  }

  let sent = 0;
  for (const chatId of chatIds) {
    const result = await sendTelegramMessageRawSequence(cfg.botToken, chatId, text);
    if (!result.ok) {
      const description = extractTelegramFailureDescription(result);
      if (isTelegramUserDeactivatedFailure(result)) {
        await markMemberTelegramDeliveryBlocked(chatId, description || 'Forbidden: user is deactivated');
        console.warn('[telegram] member delivery blocked (user deactivated):', { chatId });
        continue;
      }
      throw new Error(
        description
          ? `telegram_send_failed:${result.status}:${description}`
          : `telegram_send_failed:${result.status}`,
      );
    }
    sent += 1;
  }
  return { sent_count: sent, total: chatIds.length };
}

export async function sendTodayPrayerTelegramToSelectedMembers(
  memberIds: number[],
  prayerDateYmd?: string | null,
): Promise<{ sent_count: number; total: number }> {
  const cfg = await resolveTelegramConfig();
  if (!cfg.enabled) throw new Error('telegram_disabled');
  if (!cfg.botToken) throw new Error('telegram_missing_token');
  const ids = Array.from(new Set(memberIds.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0)));
  if (ids.length === 0) throw new Error('telegram_missing_member_chats');
  const recipients = await listTelegramDispatchRecipients();
  const chatIds = recipients.filter((r) => ids.includes(r.id)).map((r) => r.telegram_chat_id);
  if (chatIds.length === 0) throw new Error('telegram_missing_member_chats');
  const text = await buildTodayPrayerTelegramText(prayerDateYmd);
  let sent = 0;
  for (const chatId of chatIds) {
    const result = await sendTelegramMessageRawSequence(cfg.botToken, chatId, text);
    if (!result.ok) {
      const description = extractTelegramFailureDescription(result);
      if (isTelegramUserDeactivatedFailure(result)) {
        await markMemberTelegramDeliveryBlocked(chatId, description || 'Forbidden: user is deactivated');
        console.warn('[telegram] member delivery blocked (user deactivated):', { chatId });
        continue;
      }
      throw new Error(
        description
          ? `telegram_send_failed:${result.status}:${description}`
          : `telegram_send_failed:${result.status}`,
      );
    }
    sent += 1;
  }
  return { sent_count: sent, total: chatIds.length };
}

export async function runTelegramDispatchNow(
  prayerDateYmd?: string | null,
): Promise<{ sent_count: number; mode: 'all' | 'selected' }> {
  const s = await getTelegramDispatchSettings();
  if (s.target === 'selected') {
    const r = await sendTodayPrayerTelegramToSelectedMembers(s.member_ids, prayerDateYmd);
    return { sent_count: r.sent_count, mode: 'selected' };
  }
  const r = await sendTodayPrayerTelegramToAllMembers(prayerDateYmd);
  return { sent_count: r.sent_count, mode: 'all' };
}

export async function processTelegramDispatchDue(now = new Date()): Promise<{ triggered: boolean; sent_count?: number }> {
  const s = await getTelegramDispatchSettings();
  if (!s.enabled) return { triggered: false };

  const cfg = await resolveTelegramConfig();
  if (!cfg.enabled || !cfg.botToken) {
    return { triggered: false };
  }

  const nowIso = now.toISOString();
  const markSent = async () => {
    await query('UPDATE global_settings SET telegram_dispatch_last_sent_at = NOW() WHERE id = 1');
  };

  const last = s.last_sent_at_iso ? new Date(s.last_sent_at_iso) : null;
  if (s.kind === 'daily') {
    const hhmm = s.time_hhmm ?? '09:00';
    // Сравнение с локальным временем процесса Node (часовой пояс сервера / контейнера)
    const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const alreadyToday =
      last != null &&
      last.getFullYear() === now.getFullYear() &&
      last.getMonth() === now.getMonth() &&
      last.getDate() === now.getDate();
    if (cur !== hhmm || alreadyToday) return { triggered: false };
    const run = await runTelegramDispatchNow();
    await markSent();
    return { triggered: true, sent_count: run.sent_count };
  }

  const onceAt = s.once_at_iso ? new Date(s.once_at_iso) : null;
  if (!onceAt || Number.isNaN(onceAt.getTime())) return { triggered: false };
  const alreadyDone = last != null && last.toISOString() >= onceAt.toISOString();
  if (alreadyDone || nowIso < onceAt.toISOString()) return { triggered: false };
  const run = await runTelegramDispatchNow();
  await query(
    'UPDATE global_settings SET telegram_dispatch_last_sent_at = NOW(), telegram_dispatch_enabled = FALSE WHERE id = 1',
  );
  return { triggered: true, sent_count: run.sent_count };
}
