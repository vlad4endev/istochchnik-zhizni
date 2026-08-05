/** Чистые хелперы для ежемесячного сжатия медиа чатов (без I/O). */

export type ChatCompressKind = 'image' | 'audio' | 'video' | 'skip';

export function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function normalizeObjectPath(raw: unknown): string | undefined {
  const input = String(raw ?? '').trim().replace(/^\/+/, '').replace(/\0/g, '');
  if (!input || input.includes('..') || input.length > 512) return undefined;
  return input;
}

export function classifyChatMediaForCompress(opts: {
  payloadType: string;
  mimeType?: string | null;
  fileName?: string | null;
}): ChatCompressKind {
  const pt = String(opts.payloadType || '').trim();
  const mime = String(opts.mimeType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const name = String(opts.fileName || '')
    .trim()
    .toLowerCase();

  if (pt === 'video_note') return 'video';
  if (pt === 'audio') return 'audio';

  if (mime.startsWith('image/')) {
    if (mime === 'image/gif' || name.endsWith('.gif')) return 'skip';
    return 'image';
  }
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';

  if (/\.(jpe?g|png|webp|heic|heif|bmp)$/i.test(name)) return 'image';
  if (/\.(mp3|m4a|aac|ogg|oga|opus|wav|webm|caf)$/i.test(name) && pt !== 'file') return 'audio';
  if (/\.(mp3|m4a|aac|ogg|oga|opus|wav)$/i.test(name)) return 'audio';
  if (/\.(mp4|m4v|mov|webm|mkv|avi|mpeg|mpg|3gp)$/i.test(name)) return 'video';

  return 'skip';
}

/** Имеет смысл сохранять только при заметной экономии (≥5%). */
export function isWorthKeepingCompressed(beforeBytes: number, afterBytes: number): boolean {
  if (!(beforeBytes > 0) || !(afterBytes > 0)) return false;
  if (afterBytes >= beforeBytes) return false;
  return afterBytes <= beforeBytes * 0.95;
}

export function formatBytesShort(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
