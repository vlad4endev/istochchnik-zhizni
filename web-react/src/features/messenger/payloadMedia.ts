import type { MessagePayloadType, MessageWithSender } from './api/messengerApi';

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|heic|heif)$/i;
const VIDEO_EXT_RE = /\.(mp4|m4v|mov|webm|mkv|avi|mpeg|mpg|3gp|ogv)$/i;

/** Превью/плитка альбома: видео как в Telegram (не карточка «файл»). */
export function isMessengerVideoAttachment(row: Record<string, unknown>, rawUrl: string): boolean {
  const mime = String(row.mimeType ?? row.mimetype ?? '').trim().toLowerCase();
  const mimeMain = mime.split(';')[0].trim();
  if (mimeMain.startsWith('video/')) return true;
  const pathOnly = rawUrl.split('?')[0].toLowerCase();
  const n = String(row.name ?? row.filename ?? '').trim().toLowerCase();
  return VIDEO_EXT_RE.test(pathOnly) || VIDEO_EXT_RE.test(n);
}

/** URL вложения из вложенных структур (варианты API / групповых ответов). */
export function pickUrlFromNestedPayload(p: Record<string, unknown>): string {
  for (const key of ['media', 'attachment', 'file', 'content'] as const) {
    const n = p[key];
    if (n && typeof n === 'object' && !Array.isArray(n)) {
      const o = n as Record<string, unknown>;
      const u = String(o.url ?? o.src ?? o.publicUrl ?? o.public_url ?? '').trim();
      if (u) return u;
    }
  }
  return '';
}

export function getPrimaryAttachmentUrl(payload: Record<string, unknown>): string {
  const direct = String(payload.url ?? '').trim();
  if (direct) return direct;
  return pickUrlFromNestedPayload(payload);
}

export function getAlbumImageUrl(img: Record<string, unknown>): string {
  return String(img.url ?? img.src ?? img.publicUrl ?? img.public_url ?? '').trim();
}

/**
 * Определяет тип сообщения так же, как раньше в MessageBubble, плюс payloadType в camelCase и альтернативные URL.
 */
export function inferMessengerPayloadType(
  message: Pick<MessageWithSender, 'payload' | 'payload_type'> & {
    payloadType?: string;
    type?: string;
    image_url?: string | null;
    imageUrl?: string | null;
  },
): MessagePayloadType {
  const topType = String(message.type ?? '').trim().toLowerCase();
  if (topType === 'image') return 'image';
  if (topType === 'file') return 'file';
  if (message.payload_type) return message.payload_type;
  if (typeof message.payloadType === 'string' && message.payloadType.trim()) {
    return message.payloadType.trim() as MessagePayloadType;
  }
  const topImg = String(message.image_url ?? message.imageUrl ?? '').trim();
  if (topImg) return 'image';
  const p = (message.payload ?? {}) as Record<string, unknown>;
  const rawUrl = String(p.url ?? '').trim();
  const mime = String(p.mimeType ?? p.mimetype ?? '').trim().toLowerCase();
  const mimeMain = mime.split(';')[0].trim();
  const images = Array.isArray(p.images) ? p.images : [];
  if (images.length > 0) return 'image';
  if (mimeMain.startsWith('audio/')) return 'audio';
  if (mimeMain.startsWith('video/') || VIDEO_EXT_RE.test(rawUrl.split('?')[0])) return 'image';
  if (mime.startsWith('image/') || IMAGE_EXT_RE.test(rawUrl)) return 'image';
  if (rawUrl) return 'file';
  const alt = pickUrlFromNestedPayload(p);
  const pathOnly = alt.split('?')[0].toLowerCase();
  if (alt && IMAGE_EXT_RE.test(pathOnly)) return 'image';
  if (alt) return 'file';
  return 'text';
}
