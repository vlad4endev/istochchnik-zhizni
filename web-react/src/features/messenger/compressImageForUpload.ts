import imageCompression from 'browser-image-compression';

/** Длинная сторона не больше 1920 (вписывается в типичный предел 1920×1080 с сохранением пропорций). */
const MAX_EDGE = 1920;
const INITIAL_QUALITY = 0.8;

/**
 * Сжатие изображений перед POST на `/api/messenger/upload`.
 * Не-картинки возвращаются как есть.
 */
export async function compressImageForMessengerUpload(
  file: File,
  signal?: AbortSignal,
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  const opts = {
    maxSizeMB: 12,
    maxWidthOrHeight: MAX_EDGE,
    initialQuality: INITIAL_QUALITY,
    signal,
    useWebWorker: typeof Worker !== 'undefined',
  };

  try {
    return await imageCompression(file, opts);
  } catch (e) {
    if (signal?.aborted) throw e;
    try {
      return await imageCompression(file, { ...opts, useWebWorker: false });
    } catch {
      return file;
    }
  }
}
