import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';

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

/** MP4 (ISO BMFF) или совместимый контейнер; WebM — отдельно через EBML. */
function isProfileMp4FamilyMagic(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf.subarray(4, 8).toString('ascii') !== 'ftyp') return false;
  const brand = buf
    .subarray(8, 12)
    .toString('ascii')
    .replace(/\0/g, '')
    .trim()
    .toLowerCase();
  return (
    brand === 'isom' ||
    brand === 'iso2' ||
    brand.startsWith('mp4') ||
    brand === 'dash' ||
    brand === 'msnv' ||
    brand === 'avc1' ||
    brand === '3gp4' ||
    brand === '3gp5' ||
    brand === '3g2a' ||
    brand === 'qt' ||
    brand.startsWith('qt')
  );
}

function isProfileWebmMagic(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
}

function isProfileVideoMagic(buf: Buffer): boolean {
  return isProfileWebmMagic(buf) || isProfileMp4FamilyMagic(buf);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB per file (images/videos)
    files: 10,
  },
  fileFilter: (_req, file, cb) => {
    const mt = (file.mimetype || '').toLowerCase();
    if (mt.startsWith('image/') || mt.startsWith('video/')) {
      cb(null, true);
      return;
    }
    cb(new Error('Разрешены только image/* или video/*'));
  },
});

/** После приёма в memoryStorage проверяем сигнатуру (в fileFilter буфер ещё недоступен). */
function validateProfileMediaMagicBytes(files: Express.Multer.File[] | undefined): string | null {
  if (!Array.isArray(files) || files.length === 0) {
    return null;
  }
  for (const file of files) {
    const buf = file.buffer;
    const mt = (file.mimetype || '').toLowerCase();
    if (!buf || buf.length < 4) {
      return 'Некорректный медиафайл';
    }
    const declaresImage = mt.startsWith('image/');
    const declaresVideo = mt.startsWith('video/');
    const imageOk = isProfileImageMagic(buf);
    const videoOk = isProfileVideoMagic(buf);
    if (declaresImage && imageOk) {
      continue;
    }
    if (declaresVideo && videoOk) {
      continue;
    }
    return 'Файл не похож на допустимое изображение (JPEG, PNG, GIF, WebP) или видео (MP4, WebM)';
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
  upload.array('media', 10)(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: 'Файл больше 25 МБ' });
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
    const magicErr = validateProfileMediaMagicBytes(files);
    if (magicErr) {
      res.status(400).json({ error: magicErr });
      return;
    }
    next();
  });
}
