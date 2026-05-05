/** Параметры для `MediaRecorder` в голосовых сообщениях (как в мессенджерах: webm/opus или m4a в Safari). */
export function voiceRecorderOptions(): MediaRecorderOptions | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const mimeType of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mimeType)) return { mimeType };
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

/** Имя файла для загрузки в /api/messenger/upload. */
export function voiceBlobFileName(mimeType: string): string {
  const main = mimeType.split(';')[0].trim().toLowerCase();
  if (main.includes('mp4') || main === 'audio/aac') return `voice-${Date.now()}.m4a`;
  if (main.includes('ogg')) return `voice-${Date.now()}.ogg`;
  return `voice-${Date.now()}.webm`;
}

/** Кружок: webm vp8/vp9 + opus (или fallback без codecs). */
export function videoNoteRecorderOptions(): MediaRecorderOptions | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const mimeType of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mimeType)) return { mimeType };
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

export function videoNoteBlobFileName(mimeType: string): string {
  const main = mimeType.split(';')[0].trim().toLowerCase();
  if (main.includes('mp4')) return `videonote-${Date.now()}.mp4`;
  return `videonote-${Date.now()}.webm`;
}
