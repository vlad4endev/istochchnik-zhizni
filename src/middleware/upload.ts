import multer from 'multer';
import path from 'node:path';

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

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    if (isAllowedUpload(file as Express.Multer.File)) {
      cb(null, true);
      return;
    }
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
  },
});

