import { apiClient } from './client';
import { sendMessage, type MessageWithSender } from './messenger';
import { splitForSending, type AttachmentDraft } from '../lib/attachments';

const BASE = '/api/messenger';

export type UploadedFile = {
  url: string;
  name: string;
  objectPath?: string;
  mimeType: string;
  size: number;
};

/** Загрузка файла с устройства (multipart). Прогресс — в процентах. */
export async function uploadAttachment(
  file: AttachmentDraft,
  opts: { conversationId: string; onProgress?: (pct: number) => void; signal?: AbortSignal },
): Promise<UploadedFile> {
  const form = new FormData();
  // React Native принимает объект {uri,name,type} вместо Blob.
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  form.append('originalFileName', file.name);
  form.append('conversationId', opts.conversationId);

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const { data } = await apiClient.post<UploadedFile>(`${BASE}/upload`, form, {
        timeout: 30 * 60_000,
        signal: opts.signal,
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          const total = e.total ?? 0;
          if (total > 0) opts.onProgress?.(Math.min(100, Math.round(((e.loaded ?? 0) / total) * 100)));
        },
      });
      return data;
    } catch (e) {
      lastError = e;
      if (opts.signal?.aborted) break;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Не удалось загрузить файл');
}

function filePayload(f: AttachmentDraft, up: UploadedFile): Record<string, unknown> {
  return {
    url: up.url,
    name: f.name || up.name,
    objectPath: up.objectPath,
    mimeType: up.mimeType || f.mimeType,
    size: up.size || f.size,
  };
}

export type SendAttachmentsInput = {
  conversationId: string;
  items: AttachmentDraft[];
  caption: string;
  replyToMessageId: string | null;
  signal?: AbortSignal;
  /** Общий прогресс 0–100 по всем файлам. */
  onProgress?: (pct: number) => void;
};

/**
 * Отправляет вложения как на вебе: фото — одним альбомом с подписью, остальные файлы —
 * отдельными сообщениями (подпись уходит с первым). Возвращает отправленные сообщения.
 */
export async function sendAttachments(input: SendAttachmentsInput): Promise<MessageWithSender[]> {
  const { conversationId, caption, replyToMessageId, signal } = input;
  const { images, others } = splitForSending(input.items);
  const total = Math.max(1, input.items.length);
  let done = 0;
  const report = (pct: number) =>
    input.onProgress?.(Math.min(100, Math.round(((done + pct / 100) / total) * 100)));
  const upload = async (f: AttachmentDraft) => {
    const up = await uploadAttachment(f, { conversationId, signal, onProgress: report });
    done += 1;
    report(0);
    return up;
  };

  // Сначала грузим ВСЕ файлы: если связь оборвётся, ни одно сообщение ещё не отправлено
  // и повторная попытка не создаст дубликатов.
  const uploadedImages: UploadedFile[] = [];
  for (const f of images) uploadedImages.push(await upload(f));
  const uploadedOthers: UploadedFile[] = [];
  for (const f of others) uploadedOthers.push(await upload(f));

  const sent: MessageWithSender[] = [];
  let captionLeft = caption.trim();
  let reply = replyToMessageId;

  if (uploadedImages.length > 0) {
    const first = uploadedImages[0]!;
    const payload: Record<string, unknown> = {
      url: first.url,
      name: first.name,
      objectPath: first.objectPath,
      mimeType: first.mimeType,
      size: first.size,
      is_album: uploadedImages.length > 1,
      images: uploadedImages.map((u) => ({
        url: u.url,
        name: u.name,
        objectPath: u.objectPath,
        mimeType: u.mimeType,
        size: u.size,
      })),
    };
    sent.push(
      await sendMessage(conversationId, captionLeft, undefined, reply, {
        payloadType: 'image',
        payload,
      }),
    );
    captionLeft = '';
    reply = null;
  }

  for (let i = 0; i < others.length; i += 1) {
    const f = others[i]!;
    const up = uploadedOthers[i]!;
    const isAudio = f.kind === 'audio';
    const payload: Record<string, unknown> = {
      ...filePayload(f, up),
      ...(isAudio ? { kind: 'file', title: f.name.replace(/\.[^.]+$/, '') } : {}),
      ...(f.durationSec ? { durationSec: f.durationSec } : {}),
    };
    sent.push(
      await sendMessage(conversationId, captionLeft, undefined, reply, {
        payloadType: isAudio ? 'audio' : 'file',
        payload,
      }),
    );
    captionLeft = '';
    reply = null;
  }
  return sent;
}

/** Голосовое сообщение: загрузка записи + сообщение типа audio/voice. */
export async function sendVoiceMessage(input: {
  conversationId: string;
  file: AttachmentDraft;
  durationSec: number;
  replyToMessageId: string | null;
  signal?: AbortSignal;
}): Promise<MessageWithSender> {
  const up = await uploadAttachment(input.file, {
    conversationId: input.conversationId,
    signal: input.signal,
  });
  return sendMessage(input.conversationId, '', undefined, input.replyToMessageId, {
    payloadType: 'audio',
    payload: { ...filePayload(input.file, up), durationSec: input.durationSec, kind: 'voice' },
  });
}

/** Временная подписанная ссылка на вложение (для плеера и «Открыть»). */
export async function fetchAttachmentUrl(messageId: string, slot?: number): Promise<string> {
  const qs = slot != null && Number.isFinite(slot) ? `?slot=${Math.floor(slot)}` : '';
  const { data } = await apiClient.get<{ url?: string }>(
    `${BASE}/messages/${encodeURIComponent(messageId)}/attachment-url${qs}`,
  );
  if (!data?.url) throw new Error('Не удалось получить ссылку на файл');
  return data.url;
}
