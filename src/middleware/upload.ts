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
  'image/heic',
  'image/heif',
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
  '.heic',
  '.heif',
  '.pdf',
  '.txt',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
]);

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif']);
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
};

function isAllowedUpload(file: Express.Multer.File): boolean {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();

  if (ALLOWED_EXTENSIONS.has(ext) && ALLOWED_MIME_TYPES.has(mime)) {
    return true;
  }

  // Android/WebView часто шлют image/* как application/octet-stream; сжатие в браузере может обнулить MIME.
  if (IMAGE_EXTENSIONS.has(ext)) {
    if (!mime || mime === 'application/octet-stream' || mime.startsWith('image/')) {
      return true;
    }
  }

  if (ALLOWED_EXTENSIONS.has(ext) && (!mime || mime === 'application/octet-stream')) {
    return true;
  }

  // После client-side compression имя иногда `blob` или пустое — остаётся только MIME.
  if (!ext && mime.startsWith('image/')) {
    return true;
  }

  return false;
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
    let ext = path.extname(file.originalname || '').toLowerCase() || '';
    const mime = String(file.mimetype || '').toLowerCase();
    if (!ext && mime) {
      ext = MIME_TO_EXTENSION[mime] || '';
    }
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

