export type MediaFileKind = 'image' | 'video';

const VIDEO_EXT_RE = /\.(mp4|m4v|webm|mov|3gp|3g2)$/i;
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp)$/i;

/**
 * Определяет тип медиа для композера ленты/историй.
 * На части мобильных браузеров `File.type` бывает пустым — тогда смотрим расширение.
 */
export function inferMediaFileKind(file: Pick<File, 'type' | 'name'>): MediaFileKind | null {
  const mt = (file.type || '').toLowerCase();
  if (mt.startsWith('video/')) return 'video';
  if (mt.startsWith('image/')) return 'image';
  const name = file.name || '';
  if (VIDEO_EXT_RE.test(name)) return 'video';
  if (IMAGE_EXT_RE.test(name)) return 'image';
  return null;
}

/** Если в БД type ошибочно image, но URL похож на видео — всё равно рендерим <video>. */
export function looksLikeVideoUrl(url: string): boolean {
  try {
    const path = new URL(url, 'https://example.invalid').pathname;
    return VIDEO_EXT_RE.test(path);
  } catch {
    return VIDEO_EXT_RE.test(url);
  }
}
