import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import { getProfileMediaDir } from '../config/uploadsRoot';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = getProfileMediaDir();
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      console.warn('[uploads] cannot create profile-media dir:', dir, e);
    }
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '';
    const safeExt = ext && ext.length <= 12 ? ext : '';
    cb(null, `${uuidv4()}${safeExt}`);
  },
});

const upload = multer({
  storage,
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

