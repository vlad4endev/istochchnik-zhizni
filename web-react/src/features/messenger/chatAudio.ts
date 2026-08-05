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
  const name = String(payload.name ?? payload.filename ?? '').trim();
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
    const name = String(payload?.name ?? payload?.filename ?? '').trim();
    return name ? `🎵 ${name}` : '🎵 Аудиофайл';
  }
  return '🎤 Голосовое сообщение';
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

/** Отображаемое название трека без расширения. */
export function audioDisplayTitle(name: string): string {
  const base = String(name || '').trim() || 'Аудио';
  return base.replace(/\.[^.]+$/, '') || base;
}
