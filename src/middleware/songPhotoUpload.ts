import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.heic',
  '.heif',
  '.bmp',
  '.avif',
]);

function photoFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void {
  const mt = (file.mimetype || '').toLowerCase();
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (mt.startsWith('image/')) {
    cb(null, true);
    return;
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    cb(null, true);
    return;
  }
  cb(new Error('Разрешены только изображения (JPEG, PNG, WebP и др.)'));
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: photoFileFilter,
});

/** Загрузка фото песни для ИИ-распознавания (поле `photo`). */
export function songPhotoUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload.single('photo')(req, res, (err: unknown) => {
    if (!err) {
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file?.buffer || file.buffer.length < 4) {
        res.status(400).json({ error: 'Загрузите фото с текстом песни' });
        return;
      }
      const isJpeg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
      const isPng =
        file.buffer.length >= 8 &&
        file.buffer[0] === 0x89 &&
        file.buffer[1] === 0x50 &&
        file.buffer[2] === 0x4e &&
        file.buffer[3] === 0x47;
      const isWebp =
        file.buffer.length >= 12 &&
        file.buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        file.buffer.subarray(8, 12).toString('ascii') === 'WEBP';
      const isHeifFamily =
        file.buffer.length >= 12 &&
        file.buffer.subarray(4, 8).toString('ascii') === 'ftyp' &&
        ['heic', 'heif', 'mif1', 'msf1'].includes(file.buffer.subarray(8, 12).toString('ascii').toLowerCase());
      if (!(isJpeg || isPng || isWebp || isHeifFamily)) {
        res.status(400).json({ error: 'Файл не похож на валидное изображение' });
        return;
      }
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'Фото больше 10 МБ' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Ошибка загрузки';
    res.status(400).json({ error: message });
  });
}
