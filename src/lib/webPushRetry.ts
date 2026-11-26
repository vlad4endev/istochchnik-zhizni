/**
 * Поведение при ошибках Web Push по RFC 8030 / web.dev:
 * - 404/410 — подписка умерла: удалить, не ретраить.
 * - 400/401/403 (VAPID/auth) — фатально для этой подписки: удалить, не ретраить.
 * - 429 — rate limit: ретрай строго через `Retry-After` (сек), он перекрывает экспоненту.
 * - 5xx / сетевые обрывы — временно: ретрай с нарастающей паузой и джиттером.
 */
export type WebPushRetryDecision = 'remove' | 'fatal' | 'retry' | 'giveup';

const RETRY_BASE_DELAYS_MS = [500, 2000, 8000];

export function webPushRetryMaxAttempts(): number {
  return RETRY_BASE_DELAYS_MS.length + 1;
}

export function readErrorStatusCode(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'statusCode' in err) {
    const code = (err as { statusCode?: unknown }).statusCode;
    if (typeof code === 'number' && Number.isFinite(code)) return code;
  }
  return undefined;
}

export function isRetryableWebPushNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const o = err as { code?: string; message?: string };
  const code = typeof o.code === 'string' ? o.code : '';
  if (['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE'].includes(code)) {
    return true;
  }
  const m = typeof o.message === 'string' ? o.message : '';
  return /ETIMEDOUT|timeout|ECONNRESET|network|socket/i.test(m);
}

/**
 * Пауза перед следующим ретраем (мс) или null, если ретраить нельзя.
 * `Retry-After` (секунды) перекрывает экспоненциальную паузу, но ограничен сверху,
 * чтобы запрос не висел минутами в цикле отправки.
 */
export function webPushRetryDelayMs(err: unknown, attempt: number): number | null {
  const statusCode = readErrorStatusCode(err);
  if (statusCode != null) {
    if (statusCode === 429 || statusCode >= 500) {
      const retryAfterMs = readRetryAfterMs(err);
      if (retryAfterMs != null) return retryAfterMs;
      return baseDelay(attempt);
    }
    return null;
  }
  if (isRetryableWebPushNetworkError(err)) return baseDelay(attempt);
  return null;
}

const RETRY_AFTER_CAP_MS = 30_000;

function readRetryAfterMs(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const headers = (err as { headers?: unknown }).headers;
  if (!headers || typeof headers !== 'object') return null;
  const raw = (headers as Record<string, unknown>)['retry-after'];
  const val = Array.isArray(raw) ? raw[0] : raw;
  const seconds = typeof val === 'string' ? Number(val.trim()) : typeof val === 'number' ? val : NaN;
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds * 1000, RETRY_AFTER_CAP_MS);
}

function baseDelay(attempt: number): number {
  const idx = Math.min(Math.max(attempt - 1, 0), RETRY_BASE_DELAYS_MS.length - 1);
  const delay = RETRY_BASE_DELAYS_MS[idx] ?? 8000;
  // Джиттер ±20%: массовая рассылка не должна синхронно повторять весь батч.
  return Math.round(delay * (0.8 + Math.random() * 0.4));
}
