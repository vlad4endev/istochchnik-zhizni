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

  let out: File;
  try {
    out = await imageCompression(file, opts);
  } catch (e) {
    if (signal?.aborted) throw e;
    try {
      out = await imageCompression(file, { ...opts, useWebWorker: false });
    } catch {
      return file;
    }
  }
  // Иначе Multer на сервере отклоняет «blob» без расширения при строгой проверке fileFilter.
  const t = out.type || file.type;
  if (t === 'image/jpeg' && !/\.(jpe?g)$/i.test(out.name)) {
    const base = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([out], `${base}-chat.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  }
  return out;
}
