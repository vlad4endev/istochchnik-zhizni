import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import { classifyAssistantDocument, ASSISTANT_DOCUMENT_MAX_BYTES } from '../utils/assistantDocumentText';

const ALLOWED_EXT = new Set([
  '.pdf',
  '.docx',
  '.odt',
  '.xlsx',
  '.xls',
  '.pptx',
  '.txt',
  '.csv',
  '.md',
  '.markdown',
  '.rtf',
]);

function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback): void {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const kind = classifyAssistantDocument(file.originalname, file.mimetype);
  if (!ALLOWED_EXT.has(ext) || !kind || kind === 'legacy-doc') {
    cb(
      new Error(
        'Разрешены: PDF, DOCX, ODT, XLSX, PPTX, TXT, CSV, MD, RTF. Старый DOC не поддерживается.',
      ),
    );
    return;
  }
  cb(null, true);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ASSISTANT_DOCUMENT_MAX_BYTES },
  fileFilter,
});

export function aiKnowledgeUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'Файл больше 8 МБ' });
        return;
      }
      res.status(400).json({ error: err.message || 'Ошибка загрузки файла' });
      return;
    }
    const message = err instanceof Error ? err.message : 'Ошибка загрузки файла';
    res.status(400).json({ error: message });
  });
}
