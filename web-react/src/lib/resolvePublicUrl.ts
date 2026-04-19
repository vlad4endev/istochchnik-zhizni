import { resolveAxiosBaseURL } from './config';

/**
 * Хосты, для которых нельзя делать http→https при открытии приложения по HTTPS:
 * локальный Supabase/Kong (например :8085) часто без TLS — подмена даёт ERR_SSL_PROTOCOL_ERROR.
 */
function isNonPublicHttpHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return true;

  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const [a, b] = m.slice(1, 3).map((x) => Number(x));
    const c = Number(m[3]);
    const d = Number(m[4]);
    if ([a, b, c, d].some((n) => n > 255)) return false;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
    return false;
  }

  if (h === '::1' || /^fe80:/i.test(h) || /^f[cd][0-9a-f]{2}:/i.test(h)) return true;

  return false;
}

function shouldUpgradeHttpToHttps(absoluteUrl: string): boolean {
  try {
    const u = new URL(absoluteUrl);
    if (u.protocol !== 'http:') return false;
    return !isNonPublicHttpHost(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Редкий случай: API за прокси, куда проброшен только префикс `/api/*`, без отдельного `/uploads/`.
 * Тогда задайте при сборке VITE_UPLOADS_USE_API_PREFIX=true.
 */
function uploadsUseApiPrefix(): boolean {
  return import.meta.env.VITE_UPLOADS_USE_API_PREFIX === 'true';
}

/** Приводит относительный путь загрузок к виду, который ожидает nginx/Vite-прокси. */
function canonicalUploadPath(pathname: string): string {
  let p = pathname;
  if (p.startsWith('/api/messenger/public-uploads/')) {
    p = '/uploads/' + p.slice('/api/messenger/public-uploads/'.length);
  }
  if (uploadsUseApiPrefix()) {
    if (p.startsWith('/uploads/')) {
      return '/api/uploads/' + p.slice('/uploads/'.length);
    }
    return p;
  }
  if (p.startsWith('/api/uploads/')) {
    return '/uploads/' + p.slice('/api/uploads/'.length);
  }
  return p;
}

function normalizeAbsoluteUploadUrl(v: string): string {
  try {
    const u = new URL(v);
    const next = canonicalUploadPath(u.pathname);
    if (next !== u.pathname) {
      u.pathname = next;
      return u.toString();
    }
  } catch {
    /* не URL */
  }
  return v;
}

/**
 * Converts API-provided relative public paths (e.g. `/uploads/...`) to an absolute URL
 * using the same base as axios (Vite proxy in dev, VITE_API_BASE_URL in prod).
 *
 * По умолчанию используем `/uploads/...`: в docker/nginx-web.unified.conf это `^~ /uploads/` и не
 * пересекается с regex `*.(jpg|...)`, в отличие от `/api/uploads/.../file.jpg`.
 */
export function resolvePublicUrl(raw: string | null | undefined): string | null {
  let v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return null;
  if (/^\/\//.test(v)) {
    let host: string | null = null;
    try {
      host = new URL(`http:${v}`).hostname;
    } catch {
      host = null;
    }
    if (
      typeof window !== 'undefined' &&
      window.location?.protocol === 'https:' &&
      host &&
      isNonPublicHttpHost(host)
    ) {
      return `http:${v}`;
    }
    if (typeof window !== 'undefined' && window.location?.protocol) {
      return `${window.location.protocol}${v}`;
    }
    return `https:${v}`;
  }
  if (v.startsWith('api/uploads/')) v = `/${v}`;
  if (v.startsWith('uploads/')) v = `/${v}`;

  if (
    v.startsWith('/uploads/') ||
    v.startsWith('/api/uploads/') ||
    v.startsWith('/api/messenger/public-uploads/')
  ) {
    v = canonicalUploadPath(v);
  }

  if (/^https?:\/\//i.test(v)) {
    if (
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      /^http:\/\//i.test(v) &&
      shouldUpgradeHttpToHttps(v)
    ) {
      v = v.replace(/^http:\/\//i, 'https://');
    }
    return normalizeAbsoluteUploadUrl(v);
  }
  const base = resolveAxiosBaseURL().trim();
  if (!base) return v;
  try {
    return new URL(v, base).toString();
  } catch {
    return v;
  }
}
