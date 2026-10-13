import path from 'node:path';

export function isVoiceRecordingUploadName(name: string): boolean {
  return /^voice-\d+\./i.test(path.basename(String(name || '').trim()));
}

/**
 * Storage/sniff often labels audio-only WebM as video/webm. Prefer DB-normalized MIME
 * so HTMLAudioElement gets a decodable Content-Type.
 */
export function reconcileMessengerProxyContentType(
  item: { mimeType: string | null; fileName: string },
  contentType: string,
): string {
  const itemMime = String(item.mimeType || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  const ct = String(contentType || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  const baseName = path.basename(String(item.fileName || '').trim()).toLowerCase();

  if (itemMime.startsWith('audio/')) {
    if (!ct || ct === 'application/octet-stream' || ct.startsWith('video/')) {
      return itemMime;
    }
  }
  if (itemMime.startsWith('video/')) {
    if (
      !ct ||
      ct === 'application/octet-stream' ||
      (ct.startsWith('audio/webm') && !isVoiceRecordingUploadName(baseName))
    ) {
      return itemMime;
    }
  }
  if (
    (!ct || ct === 'application/octet-stream' || ct === 'video/webm') &&
    isVoiceRecordingUploadName(baseName) &&
    baseName.endsWith('.webm')
  ) {
    return 'audio/webm';
  }
  if ((!ct || ct === 'application/octet-stream') && itemMime) return itemMime;
  return contentType || itemMime || 'application/octet-stream';
}
