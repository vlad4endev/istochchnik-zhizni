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
