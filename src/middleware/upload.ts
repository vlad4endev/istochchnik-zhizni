import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import { getUploadsRoot } from '../config/uploadsRoot';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.pdf',
  '.txt',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
]);

function isAllowedUpload(file: Express.Multer.File): boolean {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext) && ALLOWED_MIME_TYPES.has(mime);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = getUploadsRoot();
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      console.warn('[uploads] cannot create messenger uploads dir:', dir, e);
    }
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '';
    const safeExt = ext && ext.length <= 12 ? ext : '';
    cb(null, `${uuidv4()}${safeExt}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    if (isAllowedUpload(file as Express.Multer.File)) {
      cb(null, true);
      return;
    }
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
  },
});

