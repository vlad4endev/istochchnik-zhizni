import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';

const MAX_BYTES = 50 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  '.ppt',
  '.pptx',
  '.pdf',
  '.doc',
  '.docx',
  '.odp',
  '.key',
]);

const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.presentation',
  'application/x-iwork-keynote-sffkey',
  'application/octet-stream',
]);

function sermonAttachmentFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase().split(';')[0].trim();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    cb(new Error('Разрешены файлы: PPT, PPTX, PDF, DOC, DOCX, ODP, KEY'));
    return;
  }
  if (mime && !ALLOWED_MIME_TYPES.has(mime) && !mime.startsWith('application/')) {
    cb(new Error('Неподдерживаемый тип файла'));
    return;
  }
  cb(null, true);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: sermonAttachmentFileFilter,
});

function looksLikeAllowedBinary(buf: Buffer, ext: string): boolean {
  if (buf.length < 4) return false;
  if (ext === '.pdf') {
    return buf.subarray(0, 4).toString('ascii') === '%PDF';
  }
  // OOXML (pptx/docx) и многие office-пакеты — ZIP (PK..)
  if (ext === '.pptx' || ext === '.docx' || ext === '.odp' || ext === '.key') {
    return buf[0] === 0x50 && buf[1] === 0x4b;
  }
  // Legacy OLE compounds (ppt/doc): D0 CF 11 E0
  if (ext === '.ppt' || ext === '.doc') {
    return (
      buf.length >= 4 &&
      buf[0] === 0xd0 &&
      buf[1] === 0xcf &&
      buf[2] === 0x11 &&
      buf[3] === 0xe0
    );
  }
  return true;
}

/** Multer wrapper: JSON errors for invalid files / size limits + light signature check. */
export function sermonAttachmentUploadMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'Файл больше 50 МБ' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    if (err) {
      const message = err instanceof Error ? err.message : 'Ошибка загрузки';
      res.status(400).json({ error: message });
      return;
    }
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file?.buffer || !file.buffer.length) {
      res.status(400).json({ error: 'Файл не передан или пуст' });
      return;
    }
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!looksLikeAllowedBinary(file.buffer, ext)) {
      res.status(400).json({ error: 'Файл повреждён или не соответствует расширению' });
      return;
    }
    next();
  });
}

export const SERMON_ATTACHMENT_MAX_BYTES = MAX_BYTES;
