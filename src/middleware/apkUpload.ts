import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';

import { ensureUploadsDirs, getAppReleasesDir } from '../config/uploadsRoot';

const APK_EXT = '.apk';
/** Typical release APKs are large; keep a hard ceiling. */
const MAX_APK_BYTES = 250 * 1024 * 1024;

function apkFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void {
  const mt = (file.mimetype || '').toLowerCase();
  const ext = path.extname(file.originalname || '').toLowerCase();
  const okMime =
    mt === 'application/vnd.android.package-archive' ||
    mt === 'application/octet-stream' ||
    mt === 'application/zip' ||
    mt === '';
  if (ext === APK_EXT && okMime) {
    cb(null, true);
    return;
  }
  cb(new Error('Разрешены только файлы .apk'));
}

ensureUploadsDirs();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      ensureUploadsDirs();
      cb(null, getAppReleasesDir());
    } catch (e) {
      cb(e as Error, getAppReleasesDir());
    }
  },
  filename: (_req, file, cb) => {
    const safeBase = path
      .basename(file.originalname || 'app.apk')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 80);
    const stamp = Date.now();
    const rand = crypto.randomBytes(4).toString('hex');
    const name = safeBase.toLowerCase().endsWith('.apk')
      ? `${stamp}-${rand}-${safeBase}`
      : `${stamp}-${rand}-${safeBase}.apk`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_APK_BYTES },
  fileFilter: apkFileFilter,
});

/** Multer wrapper for optional single APK field `apk`. */
export function apkUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload.single('apk')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'APK больше 250 МБ' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Ошибка загрузки APK';
    res.status(400).json({ error: message });
  });
}
