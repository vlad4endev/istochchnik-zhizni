import { resolveAxiosBaseURL } from './config';

/**
 * Converts API-provided relative public paths (e.g. `/uploads/...`) to an absolute URL
 * using the same base as axios (Vite proxy in dev, VITE_API_BASE_URL in prod).
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
  // Backward/legacy: some places stored uploads as `/api/uploads/...` while the server serves them on `/uploads/...`.
  if (v.startsWith('/api/messenger/public-uploads/')) {
    v = v.replace(/^\/api\/messenger\/public-uploads\//, '/api/uploads/');
  }
  if (v.startsWith('api/uploads/')) v = `/${v}`;
  // Prefer /api/uploads because some edge proxies route only /api/* to backend.
  if (v.startsWith('/uploads/')) v = v.replace(/^\/uploads\//, '/api/uploads/');
  if (/^https?:\/\//i.test(v)) {
    // Смешанный контент: страница по https, а в БД остался http (часто редиректы Supabase).
    if (
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      /^http:\/\//i.test(v)
    ) {
      return v.replace(/^http:\/\//i, 'https://');
    }
    return v;
  }
  const base = resolveAxiosBaseURL().trim();
  if (!base) return v;
  try {
    return new URL(v, base).toString();
  } catch {
    return v;
  }
}

