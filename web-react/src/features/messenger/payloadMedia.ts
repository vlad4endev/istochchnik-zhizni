import type { MessagePayloadType, MessageWithSender } from './api/messengerApi';

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

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
  message: Pick<MessageWithSender, 'payload' | 'payload_type'> & { payloadType?: string },
): MessagePayloadType {
  if (message.payload_type) return message.payload_type;
  if (typeof message.payloadType === 'string' && message.payloadType.trim()) {
    return message.payloadType.trim() as MessagePayloadType;
  }
  const p = (message.payload ?? {}) as Record<string, unknown>;
  const rawUrl = String(p.url ?? '').trim();
  const mime = String(p.mimeType ?? p.mimetype ?? '').trim().toLowerCase();
  const images = Array.isArray(p.images) ? p.images : [];
  if (images.length > 0) return 'image';
  if (mime.startsWith('image/') || IMAGE_EXT_RE.test(rawUrl)) return 'image';
  if (rawUrl) return 'file';
  const alt = pickUrlFromNestedPayload(p);
  const pathOnly = alt.split('?')[0].toLowerCase();
  if (alt && IMAGE_EXT_RE.test(pathOnly)) return 'image';
  if (alt) return 'file';
  return 'text';
}
