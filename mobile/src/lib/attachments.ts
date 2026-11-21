export type AttachmentKind = 'image' | 'video' | 'audio' | 'file';

/** Лимиты сервера: видео и аудио до 1 ГБ, остальное до 20 МБ. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_MEDIA_BYTES = 1024 * 1024 * 1024;
/** Сколько фото собираем в один альбом. */
export const MAX_ALBUM_ITEMS = 10;

export type AttachmentDraft = {
  /** Локальный uri файла на устройстве. */
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  durationSec?: number;
};

const EXT_KIND: Array<[RegExp, AttachmentKind]> = [
  [/\.(jpe?g|png|webp|gif|heic|heif)$/i, 'image'],
  [/\.(mp4|m4v|mov|webm|mkv|avi|mpeg|mpg|3gp)$/i, 'video'],
  [/\.(mp3|m4a|aac|ogg|oga|opus|wav|caf)$/i, 'audio'],
];

export function classifyAttachment(mimeType: string | null | undefined, name: string): AttachmentKind {
  const mime = String(mimeType ?? '').toLowerCase().split(';')[0]!.trim();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  for (const [re, kind] of EXT_KIND) if (re.test(name)) return kind;
  return 'file';
}

export function maxBytesFor(kind: AttachmentKind): number {
  return kind === 'video' || kind === 'audio' ? MAX_MEDIA_BYTES : MAX_FILE_BYTES;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ГБ`;
}

/** Ошибка, если файл не пройдёт на сервере; иначе null. Проверяем заранее, чтобы не грузить зря. */
export function validateAttachment(a: Pick<AttachmentDraft, 'kind' | 'size' | 'name'>): string | null {
  if (a.size <= 0) return `«${a.name}» пустой — выберите другой файл.`;
  const max = maxBytesFor(a.kind);
  if (a.size > max) {
    return a.kind === 'video' || a.kind === 'audio'
      ? `«${a.name}» больше 1 ГБ — выберите файл поменьше.`
      : `«${a.name}» больше 20 МБ — отправьте файл поменьше.`;
  }
  return null;
}

/** Имя файла для отправки: без путей, не пустое. */
export function safeFileName(raw: string | null | undefined, fallback: string): string {
  const base = String(raw ?? '').split(/[\\/]/).pop()?.trim() ?? '';
  return base || fallback;
}

/** «0:07» для голосовых и видео. */
export function formatDurationSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Фото + подпись уходят альбомом, всё остальное — отдельными сообщениями. */
export function splitForSending(items: AttachmentDraft[]): {
  images: AttachmentDraft[];
  others: AttachmentDraft[];
} {
  return {
    images: items.filter((i) => i.kind === 'image'),
    others: items.filter((i) => i.kind !== 'image'),
  };
}
