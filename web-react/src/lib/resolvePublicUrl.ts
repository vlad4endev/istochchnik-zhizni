import { resolveAxiosBaseURL } from './config';

/**
 * Converts API-provided relative public paths (e.g. `/uploads/...`) to an absolute URL
 * using the same base as axios (Vite proxy in dev, VITE_API_BASE_URL in prod).
 *
 * **404 на `/uploads/...` в проде:** файлы отдаёт Express (`app.use('/uploads', static …)`).
 * Если SPA на `app.example.com`, а nginx проксирует только `/api` на Node, запросы к
 * `https://app.example.com/uploads/…` не попадут в Node — будет 404. Нужен `location /uploads/`
 * с тем же upstream, что и `/api`, либо общий volume с файлами. Отдельно: без persistent volume
 * в Docker каталог `uploads/` обнуляется при пересборке контейнера — старые UUID в БД дадут 404.
 */
export function resolvePublicUrl(raw: string | null | undefined): string | null {
  let v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return null;
  // Backward/legacy: some places stored uploads as `/api/uploads/...` while the server serves them on `/uploads/...`.
  if (v.startsWith('/api/uploads/')) v = v.replace(/^\/api\/uploads\//, '/uploads/');
  if (v.startsWith('api/uploads/')) v = v.replace(/^api\/uploads\//, '/uploads/');
  if (/^https?:\/\//i.test(v)) return v;
  const base = resolveAxiosBaseURL().trim();
  if (!base) return v;
  try {
    return new URL(v, base).toString();
  } catch {
    return v;
  }
}

