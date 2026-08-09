/** Расширения аудио, которые принимает мессенджер (совпадает с backend upload allowlist). */
export const AUDIO_NAME_EXT_RE = /\.(mp3|m4a|aac|ogg|oga|opus|wav|webm|caf)$/i;

export const CHAT_AUDIO_ACCEPT =
  'audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.webm,.caf';

export function isChatAudioFile(file: { type?: string; name?: string }): boolean {
  const mime = String(file.type || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (mime.startsWith('audio/')) return true;
  return AUDIO_NAME_EXT_RE.test(String(file.name || '').trim());
}

/** Имена голосовых записей с микрофона (`voice-<ts>.webm` и т.п.). */
export function isVoiceRecordingFileName(name: string): boolean {
  return /^voice-\d+\./i.test(String(name || '').trim());
}

export function isMessengerAudioFilePayload(payload: Record<string, unknown> | null | undefined): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const kind = String(payload.kind ?? payload.audioKind ?? '').trim().toLowerCase();
  if (kind === 'file' || kind === 'music' || kind === 'audio_file') return true;
  if (kind === 'voice' || kind === 'recording') return false;
  const mime = String(payload.mimeType ?? payload.mimetype ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const name = String(payload.name ?? payload.filename ?? payload.originalName ?? payload.title ?? '').trim();
  if (name && isVoiceRecordingFileName(name)) return false;
  if (mime.startsWith('audio/') && name && !isVoiceRecordingFileName(name)) return true;
  if (!name) return false;
  return !isVoiceRecordingFileName(name);
}

/** Превью в списке чатов / пуш: описание, иначе имя файла или «голосовое». */
export function messengerAudioListPreview(
  content: unknown,
  payload?: Record<string, unknown> | null,
): string {
  const caption = String(content ?? '').trim();
  if (caption) return caption;
  if (isMessengerAudioFilePayload(payload)) {
    const title = resolveMessengerAudioFileTitle(payload);
    return `🎵 ${title}`;
  }
  return '🎤 Голосовое сообщение';
}

function readSyncsafeSize(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function decodeId3Text(encoding: number, data: Uint8Array): string {
  if (!data.length) return '';
  try {
    if (encoding === 0) {
      return new TextDecoder('latin1').decode(data).replace(/\0+$/g, '').trim();
    }
    if (encoding === 3) {
      return new TextDecoder('utf-8').decode(data).replace(/\0+$/g, '').trim();
    }
    if (encoding === 1 || encoding === 2) {
      // UTF-16 with BOM (1) or UTF-16BE (2)
      const hasBom = data.length >= 2 && ((data[0] === 0xff && data[1] === 0xfe) || (data[0] === 0xfe && data[1] === 0xff));
      const slice = hasBom ? data : data;
      const label = !hasBom && encoding === 2 ? 'utf-16be' : 'utf-16';
      return new TextDecoder(label).decode(slice).replace(/\0+$/g, '').trim();
    }
  } catch {
    /* ignore */
  }
  return '';
}

/** Достаёт TIT2/TT2 из ID3v2 в начале файла (если есть). */
export function parseId3v2Title(bytes: Uint8Array): string | undefined {
  if (bytes.length < 10) return undefined;
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return undefined; // ID3
  const ver = bytes[3];
  if (ver < 2 || ver > 4) return undefined;
  const headerFlags = bytes[5];
  let offset = 10;
  if (headerFlags & 0x40) {
    // extended header
    if (bytes.length < offset + 4) return undefined;
    const extSize = ver === 4 ? readSyncsafeSize(bytes, offset) : (
      (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]
    );
    offset += Math.max(4, extSize);
  }
  const tagSize = readSyncsafeSize(bytes, 6);
  const end = Math.min(bytes.length, 10 + tagSize);
  while (offset + 10 <= end) {
    let frameId = '';
    let frameSize = 0;
    let headerLen = 10;
    if (ver === 2) {
      if (offset + 6 > end) break;
      frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2]);
      if (frameId === '\0\0\0') break;
      frameSize = (bytes[offset + 3] << 16) | (bytes[offset + 4] << 8) | bytes[offset + 5];
      headerLen = 6;
    } else {
      frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
      if (frameId === '\0\0\0\0') break;
      frameSize =
        ver === 4
          ? readSyncsafeSize(bytes, offset + 4)
          : (bytes[offset + 4] << 24) | (bytes[offset + 5] << 16) | (bytes[offset + 6] << 8) | bytes[offset + 7];
      headerLen = 10;
    }
    if (frameSize <= 0 || offset + headerLen + frameSize > bytes.length) break;
    const body = bytes.subarray(offset + headerLen, offset + headerLen + frameSize);
    offset += headerLen + frameSize;
    const isTitle = frameId === 'TIT2' || frameId === 'TT2';
    if (!isTitle || body.length < 2) continue;
    const text = decodeId3Text(body[0], body.subarray(1));
    if (text) return text.slice(0, 255);
  }
  return undefined;
}

/** Имя для UI: ID3-название, иначе имя файла с устройства. */
export async function readAudioFileDisplayName(file: File): Promise<string> {
  const fallback = String(file.name || '').trim();
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const title = parseId3v2Title(new Uint8Array(buf));
    if (title) return title;
  } catch {
    /* ignore */
  }
  return fallback || 'Аудио';
}

/** Длительность выбранного аудиофайла (сек) через metadata HTMLAudioElement. */
export function readAudioFileDurationSec(file: File): Promise<number | undefined> {
  if (typeof Audio === 'undefined' || typeof URL === 'undefined') {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    let settled = false;
    const finish = (value: number | undefined) => {
      if (settled) return;
      settled = true;
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(undefined), 8000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      window.clearTimeout(timer);
      const d = audio.duration;
      finish(Number.isFinite(d) && d > 0 ? Math.max(1, Math.round(d)) : undefined);
    };
    audio.onerror = () => {
      window.clearTimeout(timer);
      finish(undefined);
    };
    audio.src = url;
  });
}

/** Имя, которое сгенерировал Storage/multer (uuid), а не пользовательский файл. */
export function isGeneratedStorageFileName(name: string): boolean {
  const base = String(name || '')
    .trim()
    .split(/[/\\]/)
    .pop() || '';
  if (!base) return true;
  const stem = base.replace(/\.[^.]+$/, '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stem);
}

/** Отображаемое название трека без расширения. */
export function audioDisplayTitle(name: string): string {
  const base = String(name || '').trim() || 'Аудио';
  if (isGeneratedStorageFileName(base)) return 'Аудиофайл';
  return base.replace(/\.[^.]+$/, '') || base;
}

/** Лучшее имя для карточки аудиофайла в чате. */
export function resolveMessengerAudioFileTitle(
  payload: Record<string, unknown> | null | undefined,
): string {
  if (!payload || typeof payload !== 'object') return 'Аудиофайл';
  const candidates = [payload.title, payload.name, payload.filename, payload.originalName, payload.original_name];
  for (const raw of candidates) {
    const value = String(raw ?? '').trim();
    if (!value) continue;
    if (isGeneratedStorageFileName(value)) continue;
    if (isVoiceRecordingFileName(value)) continue;
    const titled = audioDisplayTitle(value);
    if (titled && titled !== 'Аудиофайл') return titled;
  }
  return 'Аудиофайл';
}
