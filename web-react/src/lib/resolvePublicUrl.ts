import { resolveAxiosBaseURL } from './config';

/**
 * Converts API-provided relative public paths (e.g. `/uploads/...`) to an absolute URL
 * using the same base as axios (Vite proxy in dev, VITE_API_BASE_URL in prod).
 *
 * Локальные вложения мессенджера: `GET /api/messenger/public-uploads/...` (достаточно одного прокси на `/api`).
 * Старые ссылки `/uploads/...` по-прежнему отдаёт `app.use('/uploads', static …)` — для них нужен тот же
 * upstream в nginx, что и для `/api`, иначе 404/502. Без persistent volume в Docker каталог `uploads/`
 * обнуляется при пересборке — старые UUID в БД дадут 404.
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
  if (v.startsWith('/api/uploads/')) v = v.replace(/^\/api\/uploads\//, '/uploads/');
  if (v.startsWith('api/uploads/')) v = v.replace(/^api\/uploads\//, '/uploads/');
  // Локальные вложения чата: в БД может быть `/uploads/<uuid>.<ext>` или вложенный путь.
  // Если nginx отдаёт только `/api`, грузим через `/api/messenger/public-uploads/...`.
  if (v.startsWith('/uploads/') && !v.startsWith('/uploads/avatars/')) {
    const rest = v.slice('/uploads/'.length).replace(/^\/+/, '');
    if (rest.trim()) {
      v = `/api/messenger/public-uploads/${rest}`;
    }
  }
  // Legacy fallback для старого плоского формата UUID.
  const messengerFlatUpload = /^\/uploads\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(\.[a-z0-9]+)?(?=\?|$)/i;
  if (messengerFlatUpload.test(v.split('?')[0])) {
    v = v.replace(messengerFlatUpload, '/api/messenger/public-uploads/$1$2');
  }
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

