import { resolveApiOrigin } from './config';

/** Превращает относительный путь `/uploads/...` в полный URL API. */
export function resolvePublicUrl(path: string | null | undefined): string | null {
  if (!path?.trim()) return null;
  const raw = path.trim();
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  const origin = resolveApiOrigin();
  return `${origin}${raw.startsWith('/') ? '' : '/'}${raw}`;
}
