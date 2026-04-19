import { resolveAxiosBaseURL } from './config';

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
      /^http:\/\//i.test(v)
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
