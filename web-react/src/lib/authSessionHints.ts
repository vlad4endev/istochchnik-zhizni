import { AUTH_API_PREFIX, resolveAxiosBaseURL } from './config';

const FALLBACK_TTL_MINUTES = 60;

/**
 * TTL access-сессии с сервера (`AUTH_ACCESS_TOKEN_TTL_MINUTES`), чтобы фронт не гадал интервал refresh.
 */
export async function fetchAuthAccessTtlMinutes(signal?: AbortSignal): Promise<number> {
  const base =
    resolveAxiosBaseURL().trim() ||
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '');
  if (!base) return FALLBACK_TTL_MINUTES;
  try {
    const res = await fetch(`${base}${AUTH_API_PREFIX}/session-hints`, {
      signal,
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!res.ok) return FALLBACK_TTL_MINUTES;
    const data = (await res.json()) as { accessTokenTtlMinutes?: unknown };
    const n = Number(data.accessTokenTtlMinutes);
    if (!Number.isFinite(n)) return FALLBACK_TTL_MINUTES;
    const floored = Math.floor(n);
    if (floored < 1 || floored > 24 * 60) return FALLBACK_TTL_MINUTES;
    return floored;
  } catch {
    return FALLBACK_TTL_MINUTES;
  }
}

/** Интервал таймера: ~40% от TTL access, между 45 с и 8 мин (не душим API, не упираемся в истечение). */
export function computeProactiveRefreshIntervalMs(accessTtlMinutes: number): number {
  const ttlMs = accessTtlMinutes * 60 * 1000;
  const target = Math.floor(ttlMs * 0.4);
  const min = 45_000;
  const max = 8 * 60 * 1000;
  return Math.min(max, Math.max(min, target));
}
