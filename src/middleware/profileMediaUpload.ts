import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';

/** Лента/истории: видео с телефона часто >25 МБ; держим в memoryStorage разумный потолок. */
export const PROFILE_MEDIA_MAX_BYTES = 100 * 1024 * 1024;
export const PROFILE_MEDIA_MAX_FILES = 10;

const STILL_IMAGE_FTYP_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'mif1',
  'msf1',
  'avif',
  'avis',
]);

const VIDEO_NAME_RE = /\.(mp4|m4v|webm|mov|3gp|3g2)$/i;
const IMAGE_NAME_RE = /\.(jpe?g|png|gif|webp)$/i;

function isProfileImageMagic(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng =
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a;
  const isGif =
    buf.length >= 6 &&
    (buf.subarray(0, 6).toString('ascii') === 'GIF87a' || buf.subarray(0, 6).toString('ascii') === 'GIF89a');
  const isWebp =
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP';
  return isJpeg || isPng || isGif || isWebp;
}

function readFtypBrand(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf.subarray(4, 8).toString('ascii') !== 'ftyp') return null;
  return buf
    .subarray(8, 12)
    .toString('ascii')
    .replace(/\0/g, '')
    .trim()
    .toLowerCase();
}

/**
 * ISO BMFF (MP4/MOV/3GP/…). Телефоны пишут разные major brands —
 * принимаем любой ftyp, кроме still-image контейнеров (HEIC/AVIF).
 */
export function isProfileMp4FamilyMagic(buf: Buffer): boolean {
  const brand = readFtypBrand(buf);
  if (!brand) return false;
  if (STILL_IMAGE_FTYP_BRANDS.has(brand)) return false;
  return true;
}

export function isProfileWebmMagic(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
}

export function isProfileVideoMagic(buf: Buffer): boolean {
  return isProfileWebmMagic(buf) || isProfileMp4FamilyMagic(buf);
}

function inferImageMimeFromMagic(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buf.length >= 6 &&
    (buf.subarray(0, 6).toString('ascii') === 'GIF87a' || buf.subarray(0, 6).toString('ascii') === 'GIF89a')
  ) {
    return 'image/gif';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return 'image/jpeg';
}

function inferVideoMimeFromMagic(buf: Buffer): string {
  if (isProfileWebmMagic(buf)) return 'video/webm';
  return 'video/mp4';
}

function looksLikeMediaByName(originalname: string): 'image' | 'video' | null {
  const name = originalname || '';
  if (VIDEO_NAME_RE.test(name)) return 'video';
  if (IMAGE_NAME_RE.test(name)) return 'image';
  return null;
}

function isLooseMediaMime(mt: string): boolean {
  return !mt || mt === 'application/octet-stream' || mt === 'binary/octet-stream';
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: PROFILE_MEDIA_MAX_BYTES,
    files: PROFILE_MEDIA_MAX_FILES,
  },
  fileFilter: (_req, file, cb) => {
    const mt = (file.mimetype || '').toLowerCase();
    if (mt.startsWith('image/') || mt.startsWith('video/') || isLooseMediaMime(mt)) {
      cb(null, true);
      return;
    }
    if (looksLikeMediaByName(file.originalname || '')) {
      cb(null, true);
      return;
    }
    cb(new Error('Разрешены только image/* или video/*'));
  },
});

/**
 * После приёма в memoryStorage проверяем сигнатуру и нормализуем mimetype
 * (пустой MIME / octet-stream с телефона иначе ломает type=video в БД).
 */
export function validateAndNormalizeProfileMedia(
  files: Express.Multer.File[] | undefined,
): string | null {
  if (!Array.isArray(files) || files.length === 0) {
    return null;
  }
  for (const file of files) {
    const buf = file.buffer;
    if (!buf || buf.length < 4) {
      return 'Некорректный медиафайл';
    }
    const mt = (file.mimetype || '').toLowerCase();
    const imageOk = isProfileImageMagic(buf);
    const videoOk = isProfileVideoMagic(buf);

    if (videoOk) {
      if (!mt.startsWith('video/')) {
        file.mimetype = inferVideoMimeFromMagic(buf);
      }
      continue;
    }
    if (imageOk) {
      if (!mt.startsWith('image/')) {
        file.mimetype = inferImageMimeFromMagic(buf);
      }
      continue;
    }

    return 'Файл не похож на допустимое изображение (JPEG, PNG, GIF, WebP) или видео (MP4, MOV, WebM)';
  }
  return null;
}

/** Только для `multipart/form-data`; JSON-тело для текстовых постов не трогаем. */
export function profilePostUploadIfMultipart(req: Request, res: Response, next: NextFunction): void {
  const ct = String(req.headers['content-type'] ?? '');
  if (ct.includes('multipart/form-data')) {
    profileMediaUploadMiddleware(req, res, next);
    return;
  }
  next();
}

export function profileMediaUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload.array('media', PROFILE_MEDIA_MAX_FILES)(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({
            error: `Файл больше ${Math.round(PROFILE_MEDIA_MAX_BYTES / (1024 * 1024))} МБ`,
          });
          return;
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          res.status(400).json({ error: 'Слишком много файлов' });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      const message = err instanceof Error ? err.message : 'Ошибка загрузки';
      res.status(400).json({ error: message });
      return;
    }
    const files = (req as Request & { files?: Express.Multer.File[] }).files;
    const magicErr = validateAndNormalizeProfileMedia(files);
    if (magicErr) {
      res.status(400).json({ error: magicErr });
      return;
    }
    next();
  });
}
