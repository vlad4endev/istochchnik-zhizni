import type { NextFunction, Request, Response } from 'express';

import { pool } from '../config/db';

/**
 * Идемпотентность записей, которые Android-приложение может повторить после обрыва связи
 * или отправить из своей очереди (SQLite) позже. Клиент шлёт заголовок `Idempotency-Key`;
 * повтор с тем же ключом не выполняется второй раз — сервер отдаёт сохранённый первый ответ.
 * Без заголовка (PWA, старые клиенты) middleware ничего не делает.
 */

const KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** Только эти пути; остальные запросы с заголовком обрабатываются как обычно. */
const IDEMPOTENT_PATHS: Array<{ method: string; pattern: RegExp }> = [
  { method: 'POST', pattern: /^\/api\/calendar\/prayer-need\/submit$/ },
  { method: 'POST', pattern: /^\/api\/calendar\/prayer-section\/visit$/ },
  { method: 'PUT', pattern: /^\/api\/calendar\/member-previous-prayer-need\/[^/]+$/ },
  { method: 'PATCH', pattern: /^\/api\/(?:music|media)-schedule\/assignments\/[^/]+\/status$/ },
  { method: 'POST', pattern: /^\/api\/notifications\/deliveries\/[^/]+\/(?:open|dismiss)$/ },
  { method: 'POST', pattern: /^\/api\/notifications\/deliveries\/open-all$/ },
];

/** Запись «выполняется» старше этого срока считаем брошенной (сервер упал посреди запроса). */
const IN_FLIGHT_TTL_SECONDS = 120;
const RETENTION_DAYS = 7;

export function isIdempotentRoute(method: string, path: string): boolean {
  const m = method.toUpperCase();
  return IDEMPOTENT_PATHS.some((r) => r.method === m && r.pattern.test(path));
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!pool) return Promise.resolve();
  if (!schemaReady) {
    schemaReady = pool
      .query(
        `CREATE TABLE IF NOT EXISTS idempotency_keys (
           user_id    INTEGER NOT NULL,
           key        TEXT NOT NULL,
           method     TEXT NOT NULL,
           path       TEXT NOT NULL,
           status     INTEGER,
           body       TEXT,
           created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
           PRIMARY KEY (user_id, key)
         );
         CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created ON idempotency_keys (created_at);`,
      )
      .then(() => undefined)
      .catch((err) => {
        schemaReady = null;
        throw err;
      });
  }
  return schemaReady;
}

export async function cleanupIdempotencyKeys(): Promise<number> {
  if (!pool) return 0;
  await ensureSchema();
  const res = await pool.query(
    `DELETE FROM idempotency_keys WHERE created_at < now() - ($1::int * interval '1 day')`,
    [RETENTION_DAYS],
  );
  return res.rowCount ?? 0;
}

export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const rawKey = req.header('idempotency-key');
  const userId = (req as Request & { authUserId?: number }).authUserId;
  const path = req.originalUrl.split('?')[0].replace(/\/+$/, '');
  if (
    !rawKey ||
    !pool ||
    !userId ||
    !KEY_PATTERN.test(rawKey) ||
    !isIdempotentRoute(req.method, path)
  ) {
    next();
    return;
  }

  let claimed = false;
  try {
    await ensureSchema();
    await pool.query(
      `DELETE FROM idempotency_keys
        WHERE user_id = $1 AND key = $2 AND status IS NULL
          AND created_at < now() - ($3::int * interval '1 second')`,
      [userId, rawKey, IN_FLIGHT_TTL_SECONDS],
    );
    const ins = await pool.query(
      `INSERT INTO idempotency_keys (user_id, key, method, path)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING key`,
      [userId, rawKey, req.method.toUpperCase(), path],
    );
    claimed = (ins.rowCount ?? 0) > 0;
    if (!claimed) {
      const prev = await pool.query(
        'SELECT status, body FROM idempotency_keys WHERE user_id = $1 AND key = $2',
        [userId, rawKey],
      );
      const row = prev.rows[0] as { status: number | null; body: string | null } | undefined;
      if (row && row.status !== null) {
        res.setHeader('Idempotent-Replay', 'true');
        res.status(row.status);
        if (row.body === null) res.end();
        else res.type('application/json').send(row.body);
        return;
      }
      // Первый запрос с этим ключом ещё выполняется: клиент повторит позже, действие не дублируется.
      res.setHeader('Retry-After', '2');
      res.status(503).json({ error: 'Запрос уже выполняется, повторите позже' });
      return;
    }
  } catch (err) {
    // Хранилище ключей недоступно: не ломаем действие, выполняем его как раньше.
    console.error('[idempotency] storage failed, continuing without it:', err);
    next();
    return;
  }

  // Запоминаем итог первого выполнения в момент, когда обработчик сформировал ответ (даже если клиент
  // уже отключился); неуспешный итог освобождает ключ для повтора.
  let captured: string | null = null;
  let finalized = false;
  const finalize = (): void => {
    if (finalized) return;
    finalized = true;
    const ok = res.statusCode >= 200 && res.statusCode < 300;
    const query = ok
      ? pool!.query(
          'UPDATE idempotency_keys SET status = $3, body = $4 WHERE user_id = $1 AND key = $2',
          [userId, rawKey, res.statusCode, captured],
        )
      : pool!.query('DELETE FROM idempotency_keys WHERE user_id = $1 AND key = $2', [userId, rawKey]);
    query.catch((err) => console.error('[idempotency] finalize failed:', err));
  };
  const originalJson = res.json.bind(res);
  res.json = (body?: unknown) => {
    try {
      captured = JSON.stringify(body ?? null);
    } catch {
      captured = null;
    }
    finalize();
    return originalJson(body);
  };
  res.on('finish', finalize);
  next();
}
