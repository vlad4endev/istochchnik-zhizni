import { Capacitor } from '@capacitor/core';

import { useAuthStore } from '../features/auth/authStore';

/**
 * Внутренняя база Android-приложения (SQLite через @capacitor-community/sqlite).
 *
 * Основная база — Postgres на сервере; приложение читает её через тот же API, что и PWA.
 * Каждый успешный GET сохраняется сюда, а без сети экран получает последний сохранённый ответ.
 * Чаты (`/api/messenger`, `/api/realtime`) не сохраняются и всегда идут напрямую на сервер.
 * В PWA и iOS модуль ничего не делает.
 */

const DB_NAME = 'moya_cerkov';
const MAX_BODY_CHARS = 2_000_000;

/** Эти префиксы не сохраняем: чаты — только напрямую, остальное — токены и служебные ответы. */
const NEVER_STORE_PREFIXES = [
  '/api/messenger',
  '/api/realtime',
  '/api/auth',
  '/api/notifications/vapid-public-key',
];

export type LocalDbHit = { body: unknown; savedAt: number };

type SqliteDb = {
  open: () => Promise<void>;
  execute: (sql: string) => Promise<unknown>;
  run: (sql: string, values?: unknown[]) => Promise<unknown>;
  query: (sql: string, values?: unknown[]) => Promise<{ values?: Array<Record<string, unknown>> }>;
};

let dbPromise: Promise<SqliteDb | null> | null = null;

export function isLocalDbAvailable(): boolean {
  return Capacitor.getPlatform() === 'android';
}

async function openDb(): Promise<SqliteDb | null> {
  if (!isLocalDbAvailable()) return null;
  try {
    const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    const exists = (await sqlite.isConnection(DB_NAME, false)).result;
    const db = (
      exists
        ? await sqlite.retrieveConnection(DB_NAME, false)
        : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false)
    ) as unknown as SqliteDb;
    await db.open();
    await db.execute(
      `CREATE TABLE IF NOT EXISTS api_cache (
         user_key TEXT NOT NULL,
         url      TEXT NOT NULL,
         body     TEXT NOT NULL,
         saved_at INTEGER NOT NULL,
         PRIMARY KEY (user_key, url)
       );
       CREATE TABLE IF NOT EXISTS outbox (
         id         INTEGER PRIMARY KEY AUTOINCREMENT,
         user_key   TEXT NOT NULL,
         method     TEXT NOT NULL,
         url        TEXT NOT NULL,
         body       TEXT,
         created_at INTEGER NOT NULL,
         attempts   INTEGER NOT NULL DEFAULT 0,
         idem_key   TEXT
       );`,
    );
    // Таблица могла быть создана предыдущей сборкой без колонки ключа.
    await db.execute('ALTER TABLE outbox ADD COLUMN idem_key TEXT;').catch(() => undefined);
    return db;
  } catch (error) {
    console.warn('[localDb] SQLite недоступна, работаем без локальной базы', error);
    return null;
  }
}

function getDb(): Promise<SqliteDb | null> {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

function currentUserKey(): string {
  try {
    const s = useAuthStore.getState();
    if (!s.token) return '';
    // Публичный UUID (members.user_id) — стабильный ключ пользователя; без него — числовой id.
    const publicId = (s as { userId?: string | null }).userId;
    return String(publicId?.trim() || s.memberId || s.username || 'user');
  } catch {
    return '';
  }
}

/** Путь запроса без хоста: ключ одинаков для любого базового адреса API. */
export function normalizeCacheUrl(url: string | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url, 'http://local');
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

export function isCacheableApiUrl(url: string | undefined): boolean {
  const path = normalizeCacheUrl(url);
  if (!path.startsWith('/api/')) return false;
  return !NEVER_STORE_PREFIXES.some((p) => path.startsWith(p));
}

export async function localDbPut(url: string, body: unknown): Promise<void> {
  const userKey = currentUserKey();
  if (!userKey || !isCacheableApiUrl(url)) return;
  let text: string;
  try {
    text = JSON.stringify(body);
  } catch {
    return;
  }
  if (typeof text !== 'string' || text.length > MAX_BODY_CHARS) return;
  const db = await getDb();
  if (!db) return;
  try {
    await db.run(
      'INSERT OR REPLACE INTO api_cache (user_key, url, body, saved_at) VALUES (?, ?, ?, ?)',
      [userKey, normalizeCacheUrl(url), text, Date.now()],
    );
  } catch (error) {
    console.warn('[localDb] не удалось сохранить ответ', error);
  }
}

export async function localDbGet(url: string): Promise<LocalDbHit | null> {
  const userKey = currentUserKey();
  if (!userKey || !isCacheableApiUrl(url)) return null;
  const db = await getDb();
  if (!db) return null;
  try {
    const res = await db.query('SELECT body, saved_at FROM api_cache WHERE user_key = ? AND url = ?', [
      userKey,
      normalizeCacheUrl(url),
    ]);
    const row = res.values?.[0];
    if (!row || typeof row.body !== 'string') return null;
    return { body: JSON.parse(row.body), savedAt: Number(row.saved_at) || 0 };
  } catch {
    return null;
  }
}

/**
 * Действия, которые безопасно выполнить позже, когда появится сеть: ответ экрану не нужен,
 * повтор не создаёт лишних данных. Остальные запросы без сети падают как в PWA.
 */
const QUEUEABLE_WRITES: Array<{ method: string; pattern: RegExp }> = [
  { method: 'post', pattern: /^\/api\/calendar\/prayer-need\/submit$/ },
  { method: 'post', pattern: /^\/api\/calendar\/prayer-section\/visit$/ },
  { method: 'put', pattern: /^\/api\/calendar\/member-previous-prayer-need\/[^/]+$/ },
  { method: 'patch', pattern: /^\/api\/(music|media)-schedule\/assignments\/[^/]+\/status$/ },
  { method: 'post', pattern: /^\/api\/notifications\/deliveries\/[^/]+\/(open|dismiss)$/ },
  { method: 'post', pattern: /^\/api\/notifications\/deliveries\/open-all$/ },
];

const MAX_OUTBOX_ATTEMPTS = 8;

export type OutboxItem = { id: number; method: string; url: string; body: unknown; idemKey: string | null };

/** Ключ идемпотентности: сервер по нему узнаёт повтор того же действия и не выполняет его дважды. */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function isQueueableWrite(method: string | undefined, url: string | undefined): boolean {
  const m = (method ?? '').toLowerCase();
  const path = normalizeCacheUrl(url).split('?')[0];
  return QUEUEABLE_WRITES.some((w) => w.method === m && w.pattern.test(path));
}

export async function outboxAdd(
  method: string,
  url: string,
  body: unknown,
  idemKey: string | null,
): Promise<boolean> {
  const userKey = currentUserKey();
  if (!userKey || !isQueueableWrite(method, url)) return false;
  const db = await getDb();
  if (!db) return false;
  try {
    await db.run(
      'INSERT INTO outbox (user_key, method, url, body, created_at, idem_key) VALUES (?, ?, ?, ?, ?, ?)',
      [
        userKey,
        method.toLowerCase(),
        normalizeCacheUrl(url),
        body === undefined ? null : JSON.stringify(body),
        Date.now(),
        idemKey,
      ],
    );
    return true;
  } catch {
    return false;
  }
}

export async function outboxList(): Promise<OutboxItem[]> {
  const userKey = currentUserKey();
  if (!userKey) return [];
  const db = await getDb();
  if (!db) return [];
  try {
    const res = await db.query(
      'SELECT id, method, url, body, idem_key FROM outbox WHERE user_key = ? AND attempts < ? ORDER BY id',
      [userKey, MAX_OUTBOX_ATTEMPTS],
    );
    return (res.values ?? []).map((r) => ({
      id: Number(r.id),
      method: String(r.method),
      url: String(r.url),
      body: typeof r.body === 'string' ? JSON.parse(r.body) : undefined,
      idemKey: typeof r.idem_key === 'string' ? r.idem_key : null,
    }));
  } catch {
    return [];
  }
}

export async function outboxRemove(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.run('DELETE FROM outbox WHERE id = ?', [id]);
  } catch {
    /* запись уже удалена */
  }
}

export async function outboxMarkFailed(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.run('UPDATE outbox SET attempts = attempts + 1 WHERE id = ?', [id]);
  } catch {
    /* не критично */
  }
}

/** Выход из аккаунта: данные пользователя на устройстве не остаются. */
export async function clearLocalDb(): Promise<void> {
  if (!isLocalDbAvailable()) return;
  const db = await getDb();
  if (!db) return;
  try {
    await db.run('DELETE FROM api_cache');
    await db.run('DELETE FROM outbox');
  } catch {
    /* таблицы нет — нечего чистить */
  }
}
