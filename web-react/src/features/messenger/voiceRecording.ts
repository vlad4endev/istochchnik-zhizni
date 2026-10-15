/** Параметры для `MediaRecorder` в голосовых сообщениях.
 * Сначала m4a/mp4 (Safari/iOS и кросс-платформенное воспроизведение), затем webm/opus (Chrome). */
export function voiceRecorderOptions(): MediaRecorderOptions | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/mp4',
    'audio/aac',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
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

/** Имя файла для загрузки в /api/messenger/upload. */
export function voiceBlobFileName(mimeType: string): string {
  const main = mimeType.split(';')[0].trim().toLowerCase();
  if (main.includes('mp4') || main === 'audio/aac') return `voice-${Date.now()}.m4a`;
  if (main.includes('ogg')) return `voice-${Date.now()}.ogg`;
  return `voice-${Date.now()}.webm`;
}

/** Кружок: предпочитаем mp4 (лучше поддержка iOS), затем webm. */
export function videoNoteRecorderOptions(): MediaRecorderOptions | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
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
