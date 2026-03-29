import { Router, type Request, type Response } from 'express';
import { requireAuthSession } from '../middleware/authSession';
import * as svc from '../services/messengerService';
import { sendToRoomAll, sendToRoom, sendToMember, ensureMemberInRoom } from '../realtime/wsHub';

type AuthReq = Request & { authUserId?: number };

const router = Router();

// All messenger routes require authentication
router.use(requireAuthSession);

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
    const conversations = await svc.listConversations(userId);
    const conv = conversations.find((c) => c.id === convId);
    // Notify the other member about new conversation
    if (conv) {
      sendToMember(otherMemberId, { type: 'conv:created', conversation: conv });
    }
    res.json({ conversationId: convId, conversation: conv ?? null });
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
    // Ensure all members join the WS room
    ensureMemberInRoom(userId, convId);
    for (const mId of ids) ensureMemberInRoom(mId, convId);
    const conversations = await svc.listConversations(userId);
    const conv = conversations.find((c) => c.id === convId);
    // Notify all members
    if (conv) {
      for (const mId of ids) {
        sendToMember(mId, { type: 'conv:created', conversation: conv });
      }
    }
    res.json({ conversationId: convId, conversation: conv ?? null });
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
router.post('/conversations/:id/participants', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = req.params.id;
  const { memberId } = req.body;
  try {
    const role = await svc.getParticipantRole(convId, userId);
    if (!role || role === 'member') {
      res.status(403).json({ error: 'Only admins can add participants' });
      return;
    }
    await svc.addParticipant(convId, memberId);
    res.json({ ok: true });
  } catch (e) {
    console.error('[messenger] addParticipant error:', e);
    res.status(500).json({ error: 'Failed to add participant' });
  }
});

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
router.post('/conversations/:id/messages', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = req.params.id;
  const { content, replyToMessageId } = req.body;
  if (!content || typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'Message content is required' });
    return;
  }
  try {
    const isMember = await svc.isMemberInConversation(convId, userId);
    if (!isMember) {
      res.status(403).json({ error: 'Not a member of this conversation' });
      return;
    }
    // Channel: only owner/admin can post
    const convType = await svc.getConversationType(convId);
    if (convType === 'channel') {
      const role = await svc.getParticipantRole(convId, userId);
      if (role === 'member') {
        res.status(403).json({ error: 'Only admins can post in channels' });
        return;
      }
    }

    const message = await svc.sendMessage(convId, userId, content, replyToMessageId);
    // Broadcast to conversation room (all clients, sender sees via response)
    sendToRoom(convId, { type: 'msg:new', conversationId: convId, message }, userId);
    res.json(message);
  } catch (e) {
    console.error('[messenger] sendMessage error:', e);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

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
        sendToRoom(String(cId), { type: 'msg:edited', conversationId: String(cId), messageId: msgId, content: result.content, updatedAt: result.updated_at }, userId);
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
      sendToRoom(cId, { type: 'msg:deleted', conversationId: cId, messageId: msgId }, userId);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[messenger] deleteMessage error:', e);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// ─── Read Receipts ────────────────────────────────────────────

/** POST /api/messenger/conversations/:id/read { lastReadMessageId } */
router.post('/conversations/:id/read', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = req.params.id;
  const { lastReadMessageId } = req.body;
  if (!lastReadMessageId) {
    res.status(400).json({ error: 'lastReadMessageId is required' });
    return;
  }
  try {
    await svc.markRead(convId, userId, lastReadMessageId);
    res.json({ ok: true });
  } catch (e) {
    console.error('[messenger] markRead error:', e);
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
    await svc.addReaction(msgId, userId, emoji);
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
    await svc.removeReaction(msgId, userId, emoji);
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

export default router;
