import { query } from '../config/db';
import { getMemberAssignmentsForWeek, getPrayerDataByDate } from './calendarService';

export interface TelegramSettings {
  enabled: boolean;
  bot_token_masked: string | null;
  prayer_chat_id: string | null;
  coordinator_chat_id: string | null;
  default_chat_id: string | null;
  has_bot_token: boolean;
}

export interface TelegramSettingsUpdate {
  enabled?: boolean;
  bot_token?: string | null;
  prayer_chat_id?: string | null;
  coordinator_chat_id?: string | null;
  default_chat_id?: string | null;
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

async function ensureSettingsColumns(): Promise<void> {
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT');
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_prayer_chat_id TEXT');
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_coordinator_chat_id TEXT');
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_default_chat_id TEXT');
  await query(
    'ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_enabled BOOLEAN NOT NULL DEFAULT FALSE',
  );
}

async function readSettingsRow(): Promise<{
  telegram_enabled: boolean;
  telegram_bot_token: string | null;
  telegram_prayer_chat_id: string | null;
  telegram_coordinator_chat_id: string | null;
  telegram_default_chat_id: string | null;
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
       telegram_default_chat_id
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
      }
    | undefined;
  return {
    telegram_enabled: Boolean(row?.telegram_enabled),
    telegram_bot_token: normalizeOptionalString(row?.telegram_bot_token),
    telegram_prayer_chat_id: normalizeOptionalString(row?.telegram_prayer_chat_id),
    telegram_coordinator_chat_id: normalizeOptionalString(row?.telegram_coordinator_chat_id),
    telegram_default_chat_id: normalizeOptionalString(row?.telegram_default_chat_id),
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
    has_bot_token: Boolean(botToken),
  };
}

export async function updateTelegramSettings(input: TelegramSettingsUpdate): Promise<TelegramSettings> {
  await ensureSettingsColumns();
  const current = await readSettingsRow();
  const next = {
    telegram_enabled: typeof input.enabled === 'boolean' ? input.enabled : current.telegram_enabled,
    telegram_bot_token:
      input.bot_token !== undefined ? normalizeOptionalString(input.bot_token) : current.telegram_bot_token,
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
  };

  await query(
    `INSERT INTO global_settings (
       id,
       start_date,
       telegram_enabled,
       telegram_bot_token,
       telegram_prayer_chat_id,
       telegram_coordinator_chat_id,
       telegram_default_chat_id
     )
     VALUES (1, CURRENT_DATE, $1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE
     SET
       telegram_enabled = EXCLUDED.telegram_enabled,
       telegram_bot_token = EXCLUDED.telegram_bot_token,
       telegram_prayer_chat_id = EXCLUDED.telegram_prayer_chat_id,
       telegram_coordinator_chat_id = EXCLUDED.telegram_coordinator_chat_id,
       telegram_default_chat_id = EXCLUDED.telegram_default_chat_id`,
    [
      next.telegram_enabled,
      next.telegram_bot_token,
      next.telegram_prayer_chat_id,
      next.telegram_coordinator_chat_id,
      next.telegram_default_chat_id,
    ],
  );
  return getTelegramSettings();
}

async function resolveTelegramConfig(): Promise<{
  enabled: boolean;
  botToken: string | null;
  prayerChatId: string | null;
  coordinatorChatId: string | null;
  defaultChatId: string | null;
}> {
  const row = await readSettingsRow();
  return {
    enabled: row.telegram_enabled,
    botToken: row.telegram_bot_token ?? normalizeOptionalString(process.env.TELEGRAM_BOT_TOKEN),
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

async function sendTelegramMessageRaw(botToken: string, chatId: string, text: string): Promise<{
  ok: boolean;
  status: number;
  body: unknown;
}> {
  const endpoint = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
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
  return { ok: response.ok, status: response.status, body };
}

function formatDateRuYmd(dateYmd: string): string {
  const d = new Date(`${dateYmd}T00:00:00.000Z`);
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(d);
}

export async function buildTodayPrayerTelegramText(): Promise<string> {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);
  const data = await getPrayerDataByDate(today);
  const member = data.members[0];
  const theme = data.global_themes[0];
  const ministry = data.ministries[0];
  const backslider = data.backsliders[0];

  return [
    `Молитва на ${formatDateRuYmd(today)}`,
    '',
    `Участник: ${member?.name ?? 'Не назначен'}`,
    `Нужда: ${(member?.prayer_request ?? 'Не указана').trim() || 'Не указана'}`,
    '',
    `Тема: ${(theme?.title ?? 'Не указана').trim() || 'Не указана'}`,
    `Стих: ${(theme?.bible_verse ?? 'Не указан').trim() || 'Не указан'}`,
    `Акценты: ${(theme?.prayer_points ?? 'Не указаны').trim() || 'Не указаны'}`,
    '',
    `Служение: ${(ministry?.title ?? 'Не указано').trim() || 'Не указано'}`,
    `Запрос служения: ${(ministry?.prayer_points ?? 'Не указан').trim() || 'Не указан'}`,
    '',
    `Молитва за отпавших: ${(backslider?.name ?? 'Не указан').trim() || 'Не указан'}`,
  ].join('\n');
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
  const sent = await sendTelegramMessageRaw(cfg.botToken, chatId, text);
  if (!sent.ok) {
    throw new Error(`telegram_send_failed:${sent.status}`);
  }
  return { chat_id: chatId, status: sent.status };
}
