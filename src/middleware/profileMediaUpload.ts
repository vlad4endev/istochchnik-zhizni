import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';

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
    if (!err) {
      next();
      return;
    }
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
  });
}

