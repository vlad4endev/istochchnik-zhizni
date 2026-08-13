import type { Request, Response } from 'express';

import {
  listAssistantConversationsForAdmin,
  loadAssistantConversationMessagesForAdmin,
  type AssistantMonitorActivity,
  type AssistantMonitorSort,
} from '../services/assistantMonitorService';

type AuthRequest = Request & {
  authUserId?: number;
  authUserRole?: string;
  authUserRoles?: string[];
};

function ensureAdmin(req: Request, res: Response): boolean {
  const r = req as AuthRequest;
  if (!r.authUserId) {
    res.status(401).json({ error: 'Требуется вход в аккаунт' });
    return false;
  }
  const roles = Array.isArray(r.authUserRoles) ? r.authUserRoles : [];
  if (r.authUserRole !== 'admin' && !roles.includes('admin')) {
    res.status(403).json({ error: 'Только администратор может просматривать диалоги ИИ' });
    return false;
  }
  return true;
}

function parseLimit(raw: unknown, fallback: number): number {
  const n = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(1, Math.floor(n)));
}

function parseOffset(raw: unknown): number {
  const n = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function parseActivity(raw: unknown): AssistantMonitorActivity {
  return raw === 'today' || raw === '7d' ? raw : 'all';
}

function parseSort(raw: unknown): AssistantMonitorSort {
  return raw === 'messages' || raw === 'user_messages' ? raw : 'recent';
}

/** GET /api/settings/ai/conversations — список чатов с ИИ-помощником. */
export async function listAssistantConversationsAdminHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const result = await listAssistantConversationsForAdmin({
      search,
      activity: parseActivity(req.query.activity),
      sort: parseSort(req.query.sort),
      limit: parseLimit(req.query.limit, 50),
      offset: parseOffset(req.query.offset),
    });
    res.json(result);
  } catch (e) {
    console.error('[ai-monitor] list conversations error', e);
    res.status(500).json({ error: 'Не удалось загрузить диалоги ИИ' });
  }
}

/** GET /api/settings/ai/conversations/:id/messages — полная переписка. */
export async function getAssistantConversationMessagesAdminHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const id = String(req.params.id ?? '').trim();
  if (!/^\d+$/.test(id)) {
    res.status(400).json({ error: 'Некорректный идентификатор диалога' });
    return;
  }
  try {
    const before = typeof req.query.before === 'string' ? req.query.before : null;
    const result = await loadAssistantConversationMessagesForAdmin(id, {
      limit: parseLimit(req.query.limit, 80),
      before,
    });
    if (!result) {
      res.status(404).json({ error: 'Диалог с ИИ не найден' });
      return;
    }
    res.json(result);
  } catch (e) {
    console.error('[ai-monitor] load messages error', e);
    res.status(500).json({ error: 'Не удалось загрузить сообщения диалога' });
  }
}
