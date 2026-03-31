import { Router, type Request, type Response } from 'express';
import { requireAuthSession } from '../middleware/authSession';
import { checkChatPermission } from '../middleware/chatPermission';
import { ensureValidRequest, validateSendMessage } from '../middleware/messengerValidation';
import { upload } from '../middleware/upload';
import * as svc from '../services/messengerService';
import { sendToRoomAll, sendToRoom, sendToMember, ensureMemberInRoom } from '../realtime/wsHub';
import { sendPushNotification } from '../services/pushService';

type AuthReq = Request & { authUserId?: number };

/** DB `messages.id` / FK columns are bigint; drop temp-ids and other junk so Postgres never 500s on cast. */
function normalizeOptionalBigintId(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (!/^\d+$/.test(s)) return null;
  return s;
}

const router = Router();

async function getConversationListItemForMember(memberId: number, convId: string) {
  const list = await svc.listConversations(memberId);
  return list.find((c) => String(c.id) === String(convId)) ?? null;
}

// All messenger routes require authentication
router.use(requireAuthSession);

/** POST /api/messenger/upload (form-data: file) -> { url, name, size } */
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    res.status(400).json({ error: 'File is required' });
    return;
  }
  res.json({
    url: `/uploads/${file.filename}`,
    name: file.originalname,
    size: file.size,
  });
});

// ─── Conversations ────────────────────────────────────────────

/** GET /api/messenger/conversations */
router.get('/conversations', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  try {
    const list = await svc.listConversations(userId);
    res.json(list);
  } catch (e) {
    console.error('[messenger] listConversations error:', e);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

/** POST /api/messenger/conversations/personal { otherMemberId } */
router.post('/conversations/personal', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const { otherMemberId } = req.body;
  if (!otherMemberId || typeof otherMemberId !== 'number') {
    res.status(400).json({ error: 'otherMemberId is required' });
    return;
  }
  try {
    const convId = await svc.findOrCreatePersonalConversation(userId, otherMemberId);
    // Ensure both members join the WS room
    ensureMemberInRoom(userId, convId);
    ensureMemberInRoom(otherMemberId, convId);
    const convKey = String(convId);
    const convForMe = await getConversationListItemForMember(userId, convKey);
    // Notify the other member about new conversation (shape must be from THEIR perspective)
    const convForOther = await getConversationListItemForMember(otherMemberId, convKey);
    if (convForOther) {
      sendToMember(otherMemberId, { type: 'conv:created', conversation: convForOther });
    }
    res.json({ conversationId: convKey, conversation: convForMe ?? null });
  } catch (e: any) {
    console.error('[messenger] createPersonalConversation error:', e);
    res.status(400).json({ error: e.message || 'Failed to create conversation' });
  }
});

/** POST /api/messenger/conversations/group { title, type, memberIds } */
router.post('/conversations/group', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const { title, type, memberIds } = req.body;
  if (!title || typeof title !== 'string') {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  const convType = type === 'channel' ? 'channel' : 'group';
  const ids: number[] = Array.isArray(memberIds) ? memberIds.filter((id: any) => typeof id === 'number') : [];
  try {
    const convId = await svc.createGroupConversation(userId, title, convType, ids);
    const convKey = String(convId);
    // Ensure all members join the WS room
    ensureMemberInRoom(userId, convKey);
    for (const mId of ids) ensureMemberInRoom(mId, convKey);

    const convForMe = await getConversationListItemForMember(userId, convKey);

    // Notify all members (their perspective may differ)
    for (const mId of ids) {
      const convForMember = await getConversationListItemForMember(mId, convKey);
      if (convForMember) {
        sendToMember(mId, { type: 'conv:created', conversation: convForMember });
      }
    }

    res.json({ conversationId: convKey, conversation: convForMe ?? null });
  } catch (e) {
    console.error('[messenger] createGroupConversation error:', e);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

/** GET /api/messenger/conversations/:id/participants */
router.get('/conversations/:id/participants', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = req.params.id;
  try {
    const isMember = await svc.isMemberInConversation(convId, userId);
    if (!isMember) {
      res.status(403).json({ error: 'Not a member of this conversation' });
      return;
    }
    const participants = await svc.getConversationParticipants(convId);
    res.json(participants);
  } catch (e) {
    console.error('[messenger] getParticipants error:', e);
    res.status(500).json({ error: 'Failed to load participants' });
  }
});

/** GET /api/messenger/conversations/:id/meta */
router.get('/conversations/:id/meta', checkChatPermission('view'), async (req: Request, res: Response) => {
  const convId = String(req.params.id);
  try {
    const meta = await svc.getConversationMeta(convId);
    if (!meta) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    res.json(meta);
  } catch (e) {
    console.error('[messenger] getConversationMeta error:', e);
    res.status(500).json({ error: 'Failed to load conversation' });
  }
});

/** GET /api/messenger/conversations/:id/private-profile */
router.get('/conversations/:id/private-profile', checkChatPermission('view'), async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = String(req.params.id);
  try {
    const profile = await svc.getPrivateChatProfile(convId, userId);
    if (!profile) {
      res.status(404).json({ error: 'Profile not found (not a private chat?)' });
      return;
    }
    res.json(profile);
  } catch (e) {
    console.error('[messenger] getPrivateChatProfile error:', e);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

/** GET /api/messenger/conversations/:id/members */
router.get('/conversations/:id/members', checkChatPermission('view'), async (req: Request, res: Response) => {
  const convId = String(req.params.id);
  try {
    const members = await svc.listConversationMembers(convId);
    res.json(members);
  } catch (e) {
    console.error('[messenger] listConversationMembers error:', e);
    res.status(500).json({ error: 'Failed to load members' });
  }
});

/** PATCH /api/messenger/conversations/:id/permissions { default_permissions?, settings? } */
router.patch('/conversations/:id/permissions', checkChatPermission('manage_chat'), async (req: Request, res: Response) => {
  const convId = String(req.params.id);
  const { default_permissions, settings } = req.body ?? {};
  try {
    await svc.updateConversationPermissionsAndSettings(convId, { default_permissions, settings });
    sendToRoomAll(String(convId), { type: 'conv:updated', conversationId: String(convId) });
    res.json({ ok: true });
  } catch (e) {
    console.error('[messenger] patchConversationPermissions error:', e);
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('DB schema is outdated')) {
      res.status(503).json({ error: message });
      return;
    }
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

/** PATCH /api/messenger/conversations/:id/members/:memberId { role?, permissions?, muted_until? } */
router.patch('/conversations/:id/members/:memberId', checkChatPermission('set_permissions'), async (req: Request, res: Response) => {
  const convId = String(req.params.id);
  const targetId = Number(req.params.memberId);
  const { role, permissions, muted_until } = req.body ?? {};
  try {
    await svc.updateMemberRoleAndPermissions(convId, targetId, { role, permissions, muted_until });
    // Notify the updated member (refresh list)
    const convForMember = await getConversationListItemForMember(targetId, String(convId));
    if (convForMember) {
      sendToMember(targetId, { type: 'conv:created', conversation: convForMember });
    }
    sendToRoomAll(String(convId), { type: 'conv:updated', conversationId: String(convId) });
    res.json({ ok: true });
  } catch (e) {
    console.error('[messenger] patchMemberPermissions error:', e);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

/** PATCH /api/messenger/conversations/:id  { title?, avatar_url? } */
router.patch('/conversations/:id', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = req.params.id;
  try {
    const role = await svc.getParticipantRole(convId, userId);
    if (!role || role === 'member') {
      res.status(403).json({ error: 'Only admins can edit conversations' });
      return;
    }
    await svc.updateConversation(convId, req.body);
    res.json({ ok: true });
  } catch (e) {
    console.error('[messenger] updateConversation error:', e);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

/** POST /api/messenger/conversations/:id/participants { memberId } */
router.post(
  '/conversations/:id/participants',
  checkChatPermission('add_users'),
  async (req: Request, res: Response) => {
    const convId = req.params.id;
    const { memberId } = req.body ?? {};
    const parsed = Number(memberId);
    if (!Number.isFinite(parsed) || parsed < 1) {
      res.status(400).json({ error: 'memberId must be a positive number' });
      return;
    }
    try {
      const type = await svc.getConversationType(String(convId));
      if (!type) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      if (type === 'private') {
        res.status(400).json({ error: 'Cannot add participants to a private chat' });
        return;
      }

      await svc.addParticipant(convId, parsed);
      ensureMemberInRoom(parsed, String(convId));
      const convForMember = await getConversationListItemForMember(parsed, String(convId));
      if (convForMember) {
        sendToMember(parsed, { type: 'conv:created', conversation: convForMember });
      }
      sendToRoomAll(String(convId), { type: 'conv:updated', conversationId: String(convId) });
      res.json({ ok: true });
    } catch (e) {
      console.error('[messenger] addParticipant error:', e);
      res.status(500).json({ error: 'Failed to add participant' });
    }
  },
);

/** DELETE /api/messenger/conversations/:id/participants/:memberId */
router.delete('/conversations/:id/participants/:memberId', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = req.params.id;
  const targetId = Number(req.params.memberId);

  try {
    // Allow: owner/admin removing anyone, or member removing themselves
    if (targetId !== userId) {
      const role = await svc.getParticipantRole(convId, userId);
      if (!role || role === 'member') {
        res.status(403).json({ error: 'Only admins can remove participants' });
        return;
      }
    }
    await svc.removeParticipant(convId, targetId);
    res.json({ ok: true });
  } catch (e) {
    console.error('[messenger] removeParticipant error:', e);
    res.status(500).json({ error: 'Failed to remove participant' });
  }
});

// ─── Messages ─────────────────────────────────────────────────

/** GET /api/messenger/conversations/:id/messages?before=<id>&limit=50 */
router.get('/conversations/:id/messages', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = req.params.id;
  const before = (req.query.before as string) || undefined;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  try {
    const isMember = await svc.isMemberInConversation(convId, userId);
    if (!isMember) {
      res.status(403).json({ error: 'Not a member of this conversation' });
      return;
    }
    const messages = await svc.loadMessages(convId, userId, limit, before);
    res.json(messages);
  } catch (e) {
    console.error('[messenger] loadMessages error:', e);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

/** POST /api/messenger/conversations/:id/messages { content, replyToMessageId? } */
router.post(
  '/conversations/:id/messages',
  validateSendMessage,
  ensureValidRequest,
  checkChatPermission('send_message'),
  async (req: Request, res: Response) => {
    const userId = (req as AuthReq).authUserId!;
    const convId = req.params.id;
    const { content, replyToMessageId, clientMsgId, payloadType, payload } = req.body;
    const pt =
      payloadType === 'prayer_request' ||
      payloadType === 'text' ||
      payloadType === 'audio' ||
      payloadType === 'image' ||
      payloadType === 'file'
        ? payloadType
        : 'text';
    const pl =
      payload != null && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const replyId = normalizeOptionalBigintId(replyToMessageId);
    try {
      const message = await svc.sendMessage(convId, userId, content, replyId, clientMsgId, pt, pl);
      const convKey = String(convId);
      // Всем участникам комнаты, включая другие вкладки отправителя (дедуп по id на клиенте)
      sendToRoomAll(convKey, { type: 'msg:new', conversationId: convKey, message });

      // Push-уведомления: всем участникам, кроме отправителя.
      // Пуши приходят даже при закрытом приложении (если подписка активна и браузер разрешил).
      try {
        const memberIds = await svc.getConversationMemberIds(convKey);
        const recipients = memberIds.filter((id) => Number(id) !== Number(userId));
        const senderName = (message as any)?.sender_name ?? 'Новое сообщение';
        const bodyText =
          String((message as any)?.content ?? '').trim() ||
          ((message as any)?.payload_type && (message as any).payload_type !== 'text' ? 'Вложение' : 'Новое сообщение');
        const payload = {
          title: senderName,
          body: bodyText,
          conversationId: convKey,
          messageId: String((message as any)?.id ?? ''),
          url: `/messenger?conversationId=${encodeURIComponent(convKey)}`,
        };

        for (const rid of recipients) {
          // best-effort per recipient
          // eslint-disable-next-line no-await-in-loop
          await sendPushNotification(Number(rid), payload);
        }
      } catch (e) {
        console.warn('[messenger] push notify failed (best-effort):', e);
      }

      res.json(message);
    } catch (e) {
      const obj: Record<string, unknown> | null = e && typeof e === 'object' ? (e as Record<string, unknown>) : null;
      const message =
        e instanceof Error ? e.message : (typeof obj?.message === 'string' ? obj.message : String(e));
      const code = typeof obj?.code === 'string' ? obj.code : undefined;
      const detail = typeof obj?.detail === 'string' ? obj.detail : undefined;
      const hint = typeof obj?.hint === 'string' ? obj.hint : undefined;

      // Helpful for DB errors without leaking request body contents.
      console.error('[messenger] sendMessage error:', { message, code, detail, hint });
      res.status(500).json({
        error: 'Failed to send message',
        ...(code ? { dbCode: code } : {}),
      });
    }
  },
);

/** PATCH /api/messenger/messages/:id { content } */
router.patch('/messages/:id', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const msgId = req.params.id;
  const { content } = req.body;
  if (!content || typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'Content is required' });
    return;
  }
  try {
    const result = await svc.editMessage(msgId, userId, content);
    if (!result) {
      res.status(404).json({ error: 'Message not found or not yours' });
      return;
    }
    // Find which conversation this message belongs to and broadcast
    // (We need to query the message to get conversation_id)
    try {
      const { query: dbQuery } = await import('../config/db');
      const msgRow = await dbQuery('SELECT conversation_id FROM messages WHERE id = $1', [msgId]);
      const cId = msgRow.rows[0]?.conversation_id;
      if (cId) {
        const ck = String(cId);
        sendToRoomAll(ck, {
          type: 'msg:edited',
          conversationId: ck,
          messageId: msgId,
          content: result.content,
          updatedAt: result.updated_at,
        });
      }
    } catch { /* broadcast best-effort */ }
    res.json(result);
  } catch (e) {
    console.error('[messenger] editMessage error:', e);
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

/** DELETE /api/messenger/messages/:id */
router.delete('/messages/:id', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const msgId = req.params.id;
  try {
    // Get conversation_id before deleting
    let cId: string | null = null;
    try {
      const { query: dbQuery } = await import('../config/db');
      const msgRow = await dbQuery('SELECT conversation_id FROM messages WHERE id = $1', [msgId]);
      cId = msgRow.rows[0]?.conversation_id ? String(msgRow.rows[0].conversation_id) : null;
    } catch { /* ignore */ }
    const ok = await svc.deleteMessage(msgId, userId);
    if (!ok) {
      res.status(404).json({ error: 'Message not found or not yours' });
      return;
    }
    if (cId) {
      const ck = String(cId);
      sendToRoomAll(ck, { type: 'msg:deleted', conversationId: ck, messageId: msgId });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[messenger] deleteMessage error:', e);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// ─── Read Receipts ────────────────────────────────────────────

/** POST /api/messenger/conversations/:id/read { messageId } */
router.post('/conversations/:id/read', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = req.params.id;
  const rawMessageId = req.body?.messageId ?? req.body?.lastReadMessageId;
  const messageId = String(rawMessageId ?? '').trim();
  if (!messageId || !/^\d+$/.test(messageId)) {
    res.status(400).json({ error: 'messageId must be a numeric string' });
    return;
  }
  try {
    await svc.markRead(convId, userId, messageId);
    // Notify other participants (Telegram-like read cursor).
    sendToRoom(String(convId), {
      type: 'messages_read',
      chatId: String(convId),
      userId,
      lastReadMessageId: messageId,
    }, userId);
    // Backward compatibility for existing frontend handler.
    sendToRoom(String(convId), {
      type: 'read:updated',
      conversationId: String(convId),
      memberId: userId,
      lastReadMessageId: messageId,
    }, userId);
    res.json({ ok: true });
  } catch (e) {
    console.error('[messenger] markRead error:', e);
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('Message not found')) {
      res.status(404).json({ error: message });
      return;
    }
    if (message.includes('Invalid messageId')) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

/** GET /api/messenger/unread-count */
router.get('/unread-count', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  try {
    const count = await svc.getTotalUnreadCount(userId);
    res.json({ count });
  } catch (e) {
    console.error('[messenger] unreadCount error:', e);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// ─── Reactions ────────────────────────────────────────────────

/** POST /api/messenger/messages/:id/reactions { emoji } */
router.post('/messages/:id/reactions', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const msgId = req.params.id;
  const { emoji } = req.body;
  if (!emoji || typeof emoji !== 'string') {
    res.status(400).json({ error: 'emoji is required' });
    return;
  }
  try {
    const inserted = await svc.addReaction(msgId, userId, emoji);
    if (inserted) {
      const cId = await svc.getMessageConversationId(msgId);
      if (cId) {
        const ck = String(cId);
        sendToRoomAll(ck, {
          type: 'msg:reaction',
          conversationId: ck,
          messageId: msgId,
          emoji,
          memberId: userId,
          action: 'add',
        });
      }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[messenger] addReaction error:', e);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

/** DELETE /api/messenger/messages/:id/reactions/:emoji */
router.delete('/messages/:id/reactions/:emoji', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const msgId = req.params.id;
  const emoji = decodeURIComponent(req.params.emoji);
  try {
    const removed = await svc.removeReaction(msgId, userId, emoji);
    if (removed) {
      const cId = await svc.getMessageConversationId(msgId);
      if (cId) {
        const ck = String(cId);
        sendToRoomAll(ck, {
          type: 'msg:reaction',
          conversationId: ck,
          messageId: msgId,
          emoji,
          memberId: userId,
          action: 'remove',
        });
      }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[messenger] removeReaction error:', e);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

// ─── Search Members ───────────────────────────────────────────

/** GET /api/messenger/members/search?q=... */
router.get('/members/search', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const q = (req.query.q as string || '').trim();
  try {
    if (q.length < 1) {
      // Return all registered members when no search query
      const members = await svc.listRegisteredMembers(userId);
      res.json(members);
    } else {
      const members = await svc.searchMembers(q, userId);
      res.json(members);
    }
  } catch (e) {
    console.error('[messenger] searchMembers error:', e);
    res.status(500).json({ error: 'Failed to search members' });
  }
});

// ─── Search Messages ──────────────────────────────────────────

/** GET /api/messenger/conversations/:id/search?q=... */
router.get('/conversations/:id/search', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = req.params.id;
  const searchQuery = (req.query.q as string || '').trim();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

  if (!searchQuery) {
    res.status(400).json({ error: 'Search query is required' });
    return;
  }

  try {
    const isMember = await svc.isMemberInConversation(convId, userId);
    if (!isMember) {
      res.status(403).json({ error: 'Not a member of this conversation' });
      return;
    }
    const messages = await svc.searchMessages(convId, searchQuery, userId, limit);
    res.json(messages);
  } catch (e) {
    console.error('[messenger] searchMessages error:', e);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

export default router;
