import { query } from '../config/db';
import { fetchTelegramChatSnapshot } from './telegramService';

export interface TelegramChatRecord {
  id: number;
  chat_id: string;
  title: string | null;
  type: string | null;
  username: string | null;
  description: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

async function ensureTelegramChatsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS telegram_chats (
      id SERIAL PRIMARY KEY,
      chat_id TEXT NOT NULL UNIQUE,
      title TEXT,
      type TEXT,
      username TEXT,
      description TEXT,
      last_synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS telegram_chats_title_idx ON telegram_chats (title)');
}

function mapRow(row: Record<string, unknown>): TelegramChatRecord {
  return {
    id: Number(row.id),
    chat_id: String(row.chat_id ?? ''),
    title: typeof row.title === 'string' ? row.title : null,
    type: typeof row.type === 'string' ? row.type : null,
    username: typeof row.username === 'string' ? row.username : null,
    description: typeof row.description === 'string' ? row.description : null,
    last_synced_at:
      row.last_synced_at == null
        ? null
        : row.last_synced_at instanceof Date
          ? row.last_synced_at.toISOString()
          : String(row.last_synced_at),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? ''),
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at ?? ''),
  };
}

function normalizeChatIdInput(raw: unknown): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new Error('telegram_chat_id_invalid');
  }
  const value = String(raw).trim();
  if (!value) {
    throw new Error('telegram_chat_id_invalid');
  }
  // Accept numeric ids (-100…) or @username
  if (!/^@?[A-Za-z0-9_]{4,}$/.test(value) && !/^-?\d{5,}$/.test(value)) {
    throw new Error('telegram_chat_id_invalid');
  }
  return value;
}

export async function listTelegramChats(): Promise<TelegramChatRecord[]> {
  await ensureTelegramChatsTable();
  const result = await query(
    `SELECT id, chat_id, title, type, username, description, last_synced_at, created_at, updated_at
     FROM telegram_chats
     ORDER BY COALESCE(NULLIF(trim(title), ''), chat_id) ASC, id ASC`,
  );
  return (result.rows as Array<Record<string, unknown>>).map(mapRow);
}

export async function upsertTelegramChatById(chatIdRaw: unknown): Promise<TelegramChatRecord> {
  await ensureTelegramChatsTable();
  const chatId = normalizeChatIdInput(chatIdRaw);
  const snapshot = await fetchTelegramChatSnapshot(chatId);

  const result = await query(
    `INSERT INTO telegram_chats (
       chat_id, title, type, username, description, last_synced_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (chat_id) DO UPDATE
     SET
       title = EXCLUDED.title,
       type = EXCLUDED.type,
       username = EXCLUDED.username,
       description = EXCLUDED.description,
       last_synced_at = NOW(),
       updated_at = NOW()
     RETURNING id, chat_id, title, type, username, description, last_synced_at, created_at, updated_at`,
    [
      snapshot.chat_id,
      snapshot.title,
      snapshot.type,
      snapshot.username,
      snapshot.description,
    ],
  );

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw new Error('telegram_chat_save_failed');
  }
  return mapRow(row);
}

export async function refreshTelegramChat(id: number): Promise<TelegramChatRecord> {
  await ensureTelegramChatsTable();
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('telegram_chat_not_found');
  }
  const existing = await query(`SELECT chat_id FROM telegram_chats WHERE id = $1`, [id]);
  const chatId = (existing.rows[0] as { chat_id?: string } | undefined)?.chat_id;
  if (!chatId) {
    throw new Error('telegram_chat_not_found');
  }
  return upsertTelegramChatById(chatId);
}

export async function deleteTelegramChat(id: number): Promise<void> {
  await ensureTelegramChatsTable();
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('telegram_chat_not_found');
  }
  const result = await query(`DELETE FROM telegram_chats WHERE id = $1 RETURNING id`, [id]);
  if (!result.rows[0]) {
    throw new Error('telegram_chat_not_found');
  }
}
