import type { Request, Response } from 'express';
import { AiAgentError } from '../ai/llmClient';
import {
  createKnowledgeDocumentFromFile,
  createKnowledgeDocumentFromText,
  deleteKnowledgeDocument,
  getKnowledgeDocument,
  listKnowledgeDocuments,
  reindexKnowledgeDocument,
} from '../services/aiKnowledgeIngestService';

type AuthRequest = Request & { authUserId?: number; authUserRole?: string };

function ensureAdmin(req: Request, res: Response): boolean {
  const r = req as AuthRequest;
  if (!r.authUserId) {
    res.status(401).json({ error: 'Требуется вход в аккаунт' });
    return false;
  }
  if (r.authUserRole !== 'admin') {
    res.status(403).json({ error: 'Только администратор может управлять базой знаний ИИ' });
    return false;
  }
  return true;
}

function sendAiError(res: Response, e: unknown, fallback: string): void {
  if (e instanceof AiAgentError) {
    const status =
      e.code === 'ai_disabled'
        ? 409
        : e.code === 'ai_not_configured'
          ? 400
          : e.code === 'ai_http_error'
            ? 502
            : 400;
    res.status(status).json({ error: e.message, code: e.code });
    return;
  }
  console.error('[ai-knowledge]', fallback, e);
  res.status(500).json({ error: fallback });
}

export async function listAiKnowledgeHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const documents = await listKnowledgeDocuments();
    res.json({ documents });
  } catch (e) {
    sendAiError(res, e, 'Не удалось загрузить список документов базы знаний');
  }
}

export async function createAiKnowledgeHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const auth = req as AuthRequest;
  const uploadedBy = auth.authUserId ?? null;

  try {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (file) {
      const title =
        typeof req.body?.title === 'string' && req.body.title.trim()
          ? req.body.title.trim()
          : null;
      const doc = await createKnowledgeDocumentFromFile({
        buffer: file.buffer,
        fileName: file.originalname || 'document',
        mimeType: file.mimetype,
        title,
        uploadedBy,
      });
      res.status(201).json({ document: doc });
      return;
    }

    const body = (req.body ?? {}) as { title?: unknown; text?: unknown };
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) {
      res.status(400).json({
        error: 'Передайте файл (multipart field «file») или JSON { title, text }',
      });
      return;
    }
    const doc = await createKnowledgeDocumentFromText({
      title: title || 'Текстовый фрагмент',
      text,
      uploadedBy,
      mimeType: 'text/plain',
    });
    res.status(201).json({ document: doc });
  } catch (e) {
    sendAiError(res, e, 'Не удалось добавить документ в базу знаний');
  }
}

export async function deleteAiKnowledgeHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Некорректный id документа' });
    return;
  }
  try {
    const ok = await deleteKnowledgeDocument(id);
    if (!ok) {
      res.status(404).json({ error: 'Документ не найден' });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    sendAiError(res, e, 'Не удалось удалить документ');
  }
}

export async function reindexAiKnowledgeHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Некорректный id документа' });
    return;
  }
  try {
    const existing = await getKnowledgeDocument(id);
    if (!existing) {
      res.status(404).json({ error: 'Документ не найден' });
      return;
    }
    const doc = await reindexKnowledgeDocument(id);
    res.json({ document: doc });
  } catch (e) {
    sendAiError(res, e, 'Не удалось запустить переиндексацию');
  }
}
