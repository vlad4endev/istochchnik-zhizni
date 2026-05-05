import multer from 'multer';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

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
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/aac',
  'audio/wav',
  'audio/x-m4a',
  'audio/x-caf',
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
  '.webm',
  '.ogg',
  '.oga',
  '.opus',
  '.m4a',
  '.mp3',
  '.aac',
  '.wav',
  '.caf',
]);

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif']);
function isAllowedUpload(file: Express.Multer.File): boolean {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  const mimeMain = mime.split(';')[0].trim();

  if (ALLOWED_EXTENSIONS.has(ext) && ALLOWED_MIME_TYPES.has(mimeMain)) {
    return true;
  }

  // Android/WebView часто шлют image/* как application/octet-stream; сжатие в браузере может обнулить MIME.
  if (IMAGE_EXTENSIONS.has(ext)) {
    if (!mime || mime === 'application/octet-stream' || mimeMain.startsWith('image/')) {
      return true;
    }
  }

  if (ALLOWED_EXTENSIONS.has(ext) && (!mime || mime === 'application/octet-stream')) {
    return true;
  }

  // После client-side compression имя иногда `blob` или пустое — остаётся только MIME.
  if (!ext && mimeMain.startsWith('image/')) {
    return true;
  }

  if (ALLOWED_EXTENSIONS.has(ext) && mimeMain.startsWith('audio/')) {
    return true;
  }

  if (!ext && mimeMain.startsWith('audio/')) {
    return true;
  }

  return false;
}

/** Расширения видео для пункта «фото или видео» в мессенджере (до 1GB на файл). */
const MESSENGER_VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.m4v',
  '.mov',
  '.webm',
  '.mkv',
  '.avi',
  '.mpeg',
  '.mpg',
  '.3gp',
  '.ogv',
]);

export function isMessengerMediaUploadAllowed(file: Express.Multer.File): boolean {
  if (isAllowedUpload(file)) return true;
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  const mimeMain = mime.split(';')[0].trim();
  if (mimeMain.startsWith('video/')) return true;
  if (MESSENGER_VIDEO_EXTENSIONS.has(ext)) return true;
  if (!ext && mimeMain.startsWith('video/')) return true;
  return false;
}

/** Загрузки в чат: диск + лимит 1GB (видео); дальше в хендлере для не-видео действует 20MB. */
export const messengerUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) => {
      const base = path.basename(file.originalname || 'file').replace(/[^\w.-]+/g, '_').slice(0, 120);
      cb(null, `${randomUUID()}-${base || 'upload'}`);
    },
  }),
  limits: { fileSize: 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (isMessengerMediaUploadAllowed(file as Express.Multer.File)) {
      cb(null, true);
      return;
    }
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
  },
});

