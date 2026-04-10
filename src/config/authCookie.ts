import type { Response } from 'express';

const DEFAULT_SESSION_TTL_DAYS = 30;
const MIN_SESSION_TTL_DAYS = 1;
const MAX_SESSION_TTL_DAYS = 365;

function getSessionTtlDays(): number {
  const rawValue = process.env.AUTH_SESSION_TTL_DAYS;
  if (!rawValue) {
    return DEFAULT_SESSION_TTL_DAYS;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SESSION_TTL_DAYS;
  }
  const integerValue = Math.floor(parsed);
  return Math.min(MAX_SESSION_TTL_DAYS, Math.max(MIN_SESSION_TTL_DAYS, integerValue));
}

export function getAuthCookieName(): string {
  const n = (process.env.AUTH_COOKIE_NAME ?? 'auth_access_token').trim();
  return n || 'auth_access_token';
}

function getCookieDomain(): string | undefined {
  const d = (process.env.AUTH_COOKIE_DOMAIN ?? '').trim();
  return d || undefined;
}

function isSecureCookie(): boolean {
  if (process.env.AUTH_COOKIE_SECURE === 'true') return true;
  if (process.env.AUTH_COOKIE_SECURE === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

function sameSite(): 'Lax' | 'None' | 'Strict' {
  const raw = (process.env.AUTH_COOKIE_SAMESITE ?? 'Lax').trim();
  if (raw === 'Strict' || raw === 'None' || raw === 'Lax') return raw;
  return 'Lax';
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    let v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      v = decodeURIComponent(v);
    } catch {
      /* keep raw */
    }
    out[k] = v;
  }
  return out;
}

export function readAuthTokenFromCookies(req: { headers: { cookie?: string } }): string | null {
  const cookies = parseCookies(req.headers.cookie);
  const t = cookies[getAuthCookieName()];
  return t && t.trim() ? t.trim() : null;
}

export function getAuthCookieMaxAgeSec(): number {
  return getSessionTtlDays() * 24 * 60 * 60;
}

function buildSetCookiePair(value: string, maxAgeSec: number): string {
  const name = getAuthCookieName();
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`,
    `SameSite=${sameSite()}`,
  ];
  const domain = getCookieDomain();
  if (domain) {
    parts.push(`Domain=${domain}`);
  }
  if (isSecureCookie()) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

/** Добавляет HttpOnly cookie сессии (поддоменный wildcard через AUTH_COOKIE_DOMAIN, напр. `.church-tambov.ru`). */
export function appendSetAuthCookie(res: Response, token: string): void {
  res.append('Set-Cookie', buildSetCookiePair(token, getAuthCookieMaxAgeSec()));
}

export function appendClearAuthCookie(res: Response): void {
  const name = getAuthCookieName();
  const parts = [
    `${name}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    `SameSite=${sameSite()}`,
  ];
  const domain = getCookieDomain();
  if (domain) {
    parts.push(`Domain=${domain}`);
  }
  if (isSecureCookie()) {
    parts.push('Secure');
  }
  res.append('Set-Cookie', parts.join('; '));
}
