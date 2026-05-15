import axios from 'axios';

import { resolveAxiosBaseURL } from './config';

let refreshInFlight: Promise<AuthRefreshResult> | null = null;
let rateLimitRetryTimeout: ReturnType<typeof setTimeout> | null = null;
/** Не слать POST /refresh до этого времени (после 429 с Retry-After), чтобы таймер SessionKeepAlive не жёг квоту. */
let refreshCooldownUntilMs = 0;

export type AuthRefreshResult =
  | { status: 'refreshed'; token: string }
  /** Сессия не сбрасывается: тот же access token / cookie, повтор позже (429, сеть, 5xx на refresh). */
  | { status: 'unchanged' }
  /** Refresh явно отвергнут (невалидный refresh cookie и т.п.). */
  | { status: 'unauthorized' };

function parseRetryAfterSeconds(headers: Record<string, unknown> | undefined): number {
  if (!headers) return 60;
  const raw =
    (headers['retry-after'] as string | undefined) ??
    (headers['Retry-After'] as string | undefined);
  if (raw == null) return 60;
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

function scheduleRateLimitedRetry(delayMs: number): void {
  if (rateLimitRetryTimeout !== null) {
    clearTimeout(rateLimitRetryTimeout);
  }
  rateLimitRetryTimeout = setTimeout(() => {
    rateLimitRetryTimeout = null;
    void performAuthRefresh();
  }, delayMs);
}

/**
 * Обновляет access/refresh cookies через POST /api/auth/refresh.
 * Один общий in-flight promise на всё приложение (401-интерсептор + keep-alive).
 */
export function performAuthRefresh(): Promise<AuthRefreshResult> {
  if (!refreshInFlight) {
    refreshInFlight = doAuthRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function doAuthRefresh(): Promise<AuthRefreshResult> {
  const now = Date.now();
  if (now < refreshCooldownUntilMs) {
    return { status: 'unchanged' };
  }

  const baseURL = resolveAxiosBaseURL() ?? '';
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(350 * attempt);
    }

    let response;
    try {
      response = await axios.post(`${baseURL}/api/auth/refresh`, null, {
        timeout: 25_000,
        withCredentials: true,
        validateStatus: () => true,
      });
    } catch {
      if (attempt === maxAttempts - 1) {
        return { status: 'unchanged' };
      }
      continue;
    }

    const status = response.status;
    if (status === 200) {
      refreshCooldownUntilMs = 0;
      const data = response.data as { accessToken?: unknown; token?: unknown } | undefined;
      const nextTokenRaw = data?.accessToken ?? data?.token;
      const nextToken = typeof nextTokenRaw === 'string' ? nextTokenRaw.trim() : '';
      if (nextToken) {
        return { status: 'refreshed', token: nextToken };
      }
      return { status: 'unchanged' };
    }

    if (status === 401) {
      return { status: 'unauthorized' };
    }

    if (status === 429) {
      const sec = parseRetryAfterSeconds(response.headers as Record<string, unknown>);
      console.warn(`Auth refresh rate limited. Retry after ${sec}s`);
      refreshCooldownUntilMs = Date.now() + sec * 1000;
      scheduleRateLimitedRetry(sec * 1000);
      return { status: 'unchanged' };
    }

    if (status >= 500 && status < 600 && attempt < maxAttempts - 1) {
      continue;
    }

    return { status: 'unchanged' };
  }

  return { status: 'unchanged' };
}
