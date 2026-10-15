import { Router, type Request, type Response } from 'express';

import { requireAuthSession } from '../middleware/authSession';
import { requireAdmin } from '../middleware/requireAdmin';
import { sendToMember } from '../realtime/wsHub';
import * as svc from '../services/messengerService';
import { parseAdminChatListFilter } from '../utils/adminMessengerChats';
import { parsePageLimit, parsePageOffset } from '../utils/groupChatCreate';

const router = Router();
router.use(requireAuthSession, requireAdmin);

const PURGE_TYPES = ['group', 'channel', 'private', 'personal'] as const;

function notifyConversationDeleted(conversationId: string, memberIds: number[]): void {
  const event = { type: 'conv:deleted' as const, conversationId };
  const seen = new Set<number>();
  for (const memberId of memberIds) {
    if (!Number.isFinite(memberId) || seen.has(memberId)) continue;
    seen.add(memberId);
    sendToMember(memberId, event);
  }
}

/** GET /api/admin/messenger/conversations */
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const filter = parseAdminChatListFilter(req.query.filter);
    const search = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = parsePageLimit(req.query.limit, 40, 100);
    const offset = parsePageOffset(req.query.offset);
    const data = await svc.listConversationsForAdmin({ filter, search, limit, offset });
    res.json(data);
  } catch (e) {
    console.error('[admin-messenger] list error:', e);
    res.status(500).json({ error: 'Не удалось загрузить чаты' });
  }
});

/** POST /api/admin/messenger/conversations/purge-empty — только чаты без активных участников. */
router.post('/conversations/purge-empty', async (_req: Request, res: Response) => {
  try {
    const rows = await svc.listEmptyConversationIdsForAdmin(200);
    let deleted = 0;
    for (const row of rows) {
      const purged = await svc.purgeConversationRecord(row.id, PURGE_TYPES);
      if (!purged.deleted) continue;
      deleted += 1;
      notifyConversationDeleted(row.id, purged.memberIds);
    }
    res.json({ ok: true, deleted });
  } catch (e) {
    console.error('[admin-messenger] purge-empty error:', e);
    res.status(500).json({ error: 'Не удалось удалить пустые чаты' });
  }
});

/** DELETE /api/admin/messenger/conversations/:id — стереть чат из базы, в том числе рабочий. */
router.delete('/conversations/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id || '').trim();
  if (!/^\d+$/.test(id)) {
    res.status(400).json({ error: 'Некорректный чат' });
    return;
  }
  try {
    const purged = await svc.purgeConversationRecord(id, PURGE_TYPES);
    if (!purged.deleted) {
      res.status(404).json({ error: 'Чат не найден' });
      return;
    }
    notifyConversationDeleted(id, purged.memberIds);
    res.json({ ok: true, deleted: true });
  } catch (e) {
    console.error('[admin-messenger] purge error:', e);
    res.status(500).json({ error: 'Не удалось удалить чат из базы' });
  }
});

export default router;
