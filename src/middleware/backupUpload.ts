import type { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import multer from 'multer';

/** Full project backups can be large (DB + uploads). */
const MAX_BACKUP_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

const BACKUP_NAME_RE = /^istochnik-backup-\d{8}-\d{6}(?:\.tar\.gz)?$/i;

function backupFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void {
  const base = path.basename(file.originalname || '');
  if (!BACKUP_NAME_RE.test(base)) {
    cb(
      new Error(
        'Имя файла должно быть istochnik-backup-YYYYMMDD-HHMMSS.tar.gz (как при скачивании из админки)',
      ),
    );
    return;
  }
  const mt = (file.mimetype || '').toLowerCase();
  const okMime =
    mt === 'application/gzip' ||
    mt === 'application/x-gzip' ||
    mt === 'application/x-tar' ||
    mt === 'application/octet-stream' ||
    mt === 'application/zip' ||
    mt === '';
  if (!okMime && !base.toLowerCase().endsWith('.tar.gz')) {
    cb(new Error('Ожидается архив .tar.gz'));
    return;
  }
  cb(null, true);
}

const uploadDir = path.join(os.tmpdir(), 'istochnik-backup-uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      const safe = path
        .basename(file.originalname || 'backup.tar.gz')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .slice(0, 120);
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: MAX_BACKUP_UPLOAD_BYTES, files: 1 },
  fileFilter: backupFileFilter,
});

/** Multer wrapper for single backup archive field `archive`. */
export function backupUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload.single('archive')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'Архив бекапа больше 2 ГБ' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Ошибка загрузки бекапа';
    res.status(400).json({ error: message });
  });
}

export async function cleanupBackupUploadTemp(filePath: string | undefined): Promise<void> {
  if (!filePath) return;
  await fsp.rm(filePath, { force: true }).catch(() => undefined);
}
