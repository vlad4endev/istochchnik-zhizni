import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveMessengerConversationDeepLink } from '../config/messengerPublic';
import { requireAuthSession } from '../middleware/authSession';
import { checkChatPermission } from '../middleware/chatPermission';
import { ensureValidRequest, validateSendMessage } from '../middleware/messengerValidation';
import { upload } from '../middleware/upload';
import * as svc from '../services/messengerService';
import { sendToRoomAll, sendToRoom, sendToMember, ensureMemberInRoom } from '../realtime/wsHub';
import { sendPushNotification } from '../services/pushService';
import { getUploadsRoot } from '../config/uploadsRoot';
import {
  buildMessengerObjectPath,
  isSupabaseStorageConfigured,
  messengerBucket,
  uploadLocalFileToPublicBucket,
} from '../lib/supabaseStorage';

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

function resolvePublicUploadAbsolutePath(rawPath: string): string | null {
  let rel = String(rawPath || '').trim();
  if (!rel) return null;
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return null;
  }
  const normalized = path.posix.normalize(rel).replace(/^\/+/, '');
  if (!normalized || normalized.startsWith('..') || normalized.includes('\0')) return null;
  const absPath = path.resolve(getUploadsRoot(), normalized);
  const root = path.resolve(getUploadsRoot());
  if (!absPath.startsWith(`${root}${path.sep}`) && absPath !== root) return null;
  return absPath;
}

async function serveMessengerPublicUpload(req: Request, res: Response): Promise<void> {
  const rel = String(req.params[0] ?? '').trim();
  const absPath = resolvePublicUploadAbsolutePath(rel);
  if (!absPath) {
    res.status(400).type('text/plain').send('Bad request');
    return;
  }
  try {
    const st = await fs.stat(absPath);
    if (!st.isFile()) {
      res.status(404).type('text/plain').send('Not found');
      return;
    }
  } catch {
    res.status(404).type('text/plain').send('Not found');
    return;
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.sendFile(absPath, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
}

/**
 * Публичная раздача локального вложения по пути под `/api/messenger/...`, чтобы хватало одного прокси
 * на `/api` в nginx без отдельного `location /uploads/` (см. resolvePublicUrl).
 * Размещено ДО requireAuthSession.
 */
router.get(/^\/public-uploads\/(.+)$/, (req: Request, res: Response) => {
  void serveMessengerPublicUpload(req, res);
});
router.head(/^\/public-uploads\/(.+)$/, (req: Request, res: Response) => {
  void serveMessengerPublicUpload(req, res);
});

function localMessengerPublicUploadUrl(filename: string): string {
  return `/api/messenger/public-uploads/${filename}`;
}

/** Multer без обёртки отдаёт 500 при LIMIT_* / fileFilter — отвечаем JSON 400 как в authRoutes. */
function messengerUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'File too large', maxBytes: 20 * 1024 * 1024 });
        return;
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        res.status(400).json({ error: 'File type not allowed' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Upload failed';
    res.status(400).json({ error: message });
  });
}

async function getConversationListItemForMember(memberId: number, convId: string) {
  const list = await svc.listConversations(memberId);
  return list.find((c) => String(c.id) === String(convId)) ?? null;
}

// All messenger routes require authentication
router.use(requireAuthSession);

/** GET /api/messenger/uploads/health */
router.get('/uploads/health', async (_req: Request, res: Response) => {
  const root = getUploadsRoot();
  try {
    await fs.mkdir(root, { recursive: true });
    await fs.access(root, fsConstants.R_OK | fsConstants.W_OK);
    const st = await fs.stat(root);
    if (!st.isDirectory()) {
      res.status(503).json({ ok: false, storage: 'unavailable', reason: 'uploads_path_not_directory' });
      return;
    }
    if (isSupabaseStorageConfigured()) {
      res.json({ ok: true, storage: 'supabase', bucket: messengerBucket(), temp_uploads: 'local_writable' });
      return;
    }
    res.json({ ok: true, storage: 'local' });
  } catch (e) {
    console.error('[messenger] uploads health check failed:', e);
    res.status(503).json({ ok: false, storage: 'unavailable', reason: 'uploads_not_writable' });
  }
});

/** POST /api/messenger/studio/song-chat { songId } — чат обсуждения песни (студия). */
router.post('/studio/song-chat', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const songId = Number((req.body as { songId?: unknown })?.songId);
  if (!Number.isFinite(songId) || songId <= 0) {
    res.status(400).json({ error: 'songId is required' });
    return;
  }
  try {
    const { conversationId } = await svc.findOrCreateStudioSongConversation(songId, userId);
    ensureMemberInRoom(userId, conversationId);
    res.json({
      conversationId,
      openUrl: resolveMessengerConversationDeepLink(conversationId),
    });
  } catch (e) {
    console.error('[messenger] studio song-chat error:', e);
    res.status(500).json({ error: 'Failed to open song chat' });
  }
});

/** При ошибке Supabase оставляем файл на диске и отдаём через /api/messenger/public-uploads/… . Отключить строгий режим 500: MESSENGER_UPLOAD_FALLBACK_LOCAL=false */
function messengerUploadFallbackLocalEnabled(): boolean {
  const v = String(process.env.MESSENGER_UPLOAD_FALLBACK_LOCAL ?? '').trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'no') return false;
  return true;
}

/** POST /api/messenger/upload (form-data: file) -> { url, name, size } */
router.post('/upload', messengerUploadMiddleware, async (req: Request, res: Response) => {
  const startedAt = Date.now();
  try {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ error: 'File is required' });
      return;
    }
    const memberId = (req as AuthReq).authUserId!;
    let url: string;

    if (isSupabaseStorageConfigured()) {
      const bucket = messengerBucket();
      const objectPath = buildMessengerObjectPath(memberId, file.originalname || path.basename(file.path));
      const localPath = file.path;
      try {
        const { publicUrl } = await uploadLocalFileToPublicBucket({
          bucket,
          objectPath,
          localPath,
          contentType: file.mimetype || undefined,
        });
        url = publicUrl;
        try {
          await fs.unlink(localPath);
        } catch {
          /* ignore */
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[messenger] Supabase upload failed:', msg);
        if (messengerUploadFallbackLocalEnabled()) {
          console.warn('[messenger] MESSENGER_UPLOAD_FALLBACK_LOCAL: serving file from disk', localPath);
          url = localMessengerPublicUploadUrl(file.filename);
        } else {
          try {
            await fs.unlink(localPath);
          } catch {
            /* ignore */
          }
          res.status(500).json({ error: 'Storage upload failed', code: 'supabase_upload' });
          return;
        }
      }
    } else {
      url = localMessengerPublicUploadUrl(file.filename);
    }

    res.json({
      url,
      name: file.originalname,
      originalName: file.originalname,
      mimeType: file.mimetype || '',
      size: file.size,
      upload_ms: Date.now() - startedAt,
    });
  } catch (e) {
    console.error('[messenger] upload handler error:', e);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Upload failed', code: 'upload_handler' });
    }
  }
});

// ─── Conversations ────────────────────────────────────────────

/** GET /api/messenger/conversations */
router.get('/conversations', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const startedAt = Date.now();
  try {
    const list = await svc.listConversations(userId);
    res.setHeader('Server-Timing', `listConversations;dur=${Date.now() - startedAt}`);
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
    const auth = req.chatAuth!;
    let myLastRead: string | null = null;
    try {
      myLastRead = await svc.getParticipantLastReadMessageId(convId, auth.memberId);
    } catch (e) {
      console.warn('[messenger] getParticipantLastReadMessageId:', e);
    }
    res.json({
      ...meta,
      my_role: auth.role,
      my_effective_permissions: auth.effective,
      my_last_read_message_id: myLastRead,
    });
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

/** PATCH /api/messenger/conversations/:id  { title?, avatar_url? } — только с правом «управлять чатом» */
router.patch('/conversations/:id', checkChatPermission('manage_chat'), async (req: Request, res: Response) => {
  const convId = req.params.id;
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const updates: { title?: string; avatar_url?: string | null } = {};
    if (typeof body.title === 'string') {
      updates.title = body.title;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'avatar_url') || Object.prototype.hasOwnProperty.call(body, 'avatarUrl')) {
      const v = body.avatar_url !== undefined ? body.avatar_url : body.avatarUrl;
      if (v === null) {
        updates.avatar_url = null;
      } else if (typeof v === 'string') {
        updates.avatar_url = v.trim();
      }
    }
    await svc.updateConversation(convId, updates);
    const meta = await svc.getConversationMeta(String(convId));
    const convKey = String(convId);
    if (meta) {
      sendToRoomAll(convKey, {
        type: 'conv:updated',
        conversationId: convKey,
        conversation: {
          avatar_url: meta.avatar_url,
          title: meta.title,
          updated_at: meta.updated_at,
        },
      });
    } else {
      sendToRoomAll(convKey, { type: 'conv:updated', conversationId: convKey });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[messenger] updateConversation error:', e);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

/** PATCH /api/messenger/conversations/:id/my-ui — закрепить в списке, папка, без звука (только для себя) */
router.patch('/conversations/:id/my-ui', checkChatPermission('view'), async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = String(req.params.id);
  const body = req.body ?? {};
  const patch: {
    muted?: boolean;
    uiPinned?: boolean;
    uiFolder?: 'personal' | 'ministry' | null;
  } = {};
  if (typeof body.muted === 'boolean') patch.muted = body.muted;
  if (typeof body.uiPinned === 'boolean') patch.uiPinned = body.uiPinned;
  if ('uiFolder' in body) {
    const v = body.uiFolder;
    patch.uiFolder = v === 'personal' || v === 'ministry' ? v : null;
  }
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: 'No valid fields: muted, uiPinned, uiFolder' });
    return;
  }
  try {
    await svc.patchMyConversationUi(convId, userId, patch);
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'Forbidden') {
      res.status(403).json({ error: msg });
      return;
    }
    console.error('[messenger] patchMyConversationUi error:', e);
    res.status(500).json({ error: 'Failed to update chat preferences' });
  }
});

/** POST /api/messenger/conversations/:id/clear-history — удалить все сообщения для всех */
router.post('/conversations/:id/clear-history', checkChatPermission('view'), async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = String(req.params.id);
  try {
    await svc.clearConversationHistory(convId, userId);
    sendToRoomAll(convId, { type: 'conv:history_cleared', conversationId: convId });
    sendToRoomAll(convId, { type: 'conv:updated', conversationId: convId });
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'Forbidden') {
      res.status(403).json({ error: msg });
      return;
    }
    console.error('[messenger] clearConversationHistory error:', e);
    res.status(500).json({ error: 'Failed to clear history' });
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

      const alreadyActive = await svc.isMemberInConversation(String(convId), parsed);
      if (alreadyActive) {
        res.json({ ok: true, alreadyMember: true });
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
    sendToRoomAll(String(convId), { type: 'conv:updated', conversationId: String(convId) });
    res.json({ ok: true });
  } catch (e) {
    console.error('[messenger] removeParticipant error:', e);
    res.status(500).json({ error: 'Failed to remove participant' });
  }
});

/** GET /api/messenger/conversations/:id/pinned-messages */
router.get('/conversations/:id/pinned-messages', checkChatPermission('view'), async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = String(req.params.id);
  const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 15));
  try {
    const list = await svc.listPinnedMessages(convId, userId, limit);
    res.json(list);
  } catch (e) {
    console.error('[messenger] listPinnedMessages error:', e);
    res.status(500).json({ error: 'Failed to load pinned messages' });
  }
});

/** POST /api/messenger/conversations/:id/pins { messageId } */
router.post('/conversations/:id/pins', checkChatPermission('pin_messages'), async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = String(req.params.id);
  const messageId = req.body?.messageId;
  if (messageId == null || !/^\d+$/.test(String(messageId).trim())) {
    res.status(400).json({ error: 'messageId is required' });
    return;
  }
  try {
    await svc.pinMessageInConversation(convId, String(messageId).trim(), userId);
    sendToRoomAll(String(convId), { type: 'conv:updated', conversationId: String(convId) });
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'Message not found') {
      res.status(404).json({ error: msg });
      return;
    }
    console.error('[messenger] pinMessage error:', e);
    res.status(500).json({ error: 'Failed to pin message' });
  }
});

/** DELETE /api/messenger/conversations/:id/pins/:messageId */
router.delete(
  '/conversations/:id/pins/:messageId',
  checkChatPermission('pin_messages'),
  async (req: Request, res: Response) => {
    const convId = String(req.params.id);
    const msgId = String(req.params.messageId || '').trim();
    if (!/^\d+$/.test(msgId)) {
      res.status(400).json({ error: 'Invalid messageId' });
      return;
    }
    try {
      await svc.unpinMessageInConversation(convId, msgId);
      sendToRoomAll(String(convId), { type: 'conv:updated', conversationId: String(convId) });
      res.json({ ok: true });
    } catch (e) {
      console.error('[messenger] unpinMessage error:', e);
      res.status(500).json({ error: 'Failed to unpin message' });
    }
  },
);

// ─── Messages ─────────────────────────────────────────────────

/** GET /api/messenger/conversations/:id/messages?before=<id>|after=<id>&limit=50 */
router.get('/conversations/:id/messages', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const startedAt = Date.now();
  const convId = req.params.id;
  const before = (req.query.before as string) || undefined;
  const after = (req.query.after as string) || undefined;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  try {
    if (before && after) {
      res.status(400).json({ error: 'Use either before or after, not both' });
      return;
    }
    const isMember = await svc.isMemberInConversation(convId, userId);
    if (!isMember) {
      res.status(403).json({ error: 'Not a member of this conversation' });
      return;
    }
    const messages = after
      ? await svc.loadMessagesAfter(convId, userId, after, limit)
      : await svc.loadMessages(convId, userId, limit, before);
    res.setHeader('Server-Timing', `loadMessages;dur=${Date.now() - startedAt}`);
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
    const requestStartedAt = Date.now();
    const pt =
      payloadType === 'prayer_request' ||
      payloadType === 'text' ||
      payloadType === 'audio' ||
      payloadType === 'image' ||
      payloadType === 'file' ||
      payloadType === 'poll'
        ? payloadType
        : 'text';
    const pl =
      payload != null && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const replyId = normalizeOptionalBigintId(replyToMessageId);
    try {
      const safeClientMsgId =
        typeof clientMsgId === 'string' && clientMsgId.trim()
          ? clientMsgId.trim().slice(0, 160)
          : `srv-${randomUUID()}`;
      const convKey = String(convId);
      const prepared = await svc.prepareMessageForSend(convId, userId, content, replyId, safeClientMsgId, pt, pl);
      const pendingRealtime = { ...prepared.pendingMessage, is_read: false as const };
      // Low-latency: fan-out до INSERT; клиенты сливают pending → финальный id по client_msg_id.
      sendToRoomAll(convKey, { type: 'msg:new', conversationId: convKey, message: pendingRealtime });

      let message: Awaited<ReturnType<typeof svc.persistPreparedMessage>>;
      try {
        message = await svc.persistPreparedMessage(prepared);
      } catch (persistErr) {
        console.error('[messenger] persistPreparedMessage failed:', persistErr);
        const cid = String(prepared.pendingMessage.client_msg_id ?? '').trim();
        if (cid) {
          sendToRoomAll(convKey, {
            type: 'msg:send_failed',
            conversationId: convKey,
            clientMsgId: cid,
            reason: 'db_error',
          });
        }
        res.status(503).json({ error: 'Failed to save message' });
        return;
      }

      // Явный флаг для клиентского счётчика: только is_read === false считается непрочитанным.
      const messageForRealtime = { ...message, is_read: false as const };
      sendToRoomAll(convKey, { type: 'msg:new', conversationId: convKey, message: messageForRealtime });
      res.json({
        ...messageForRealtime,
        send_api_ms: Date.now() - requestStartedAt,
      });

      // Push-уведомления: всем участникам, кроме отправителя.
      // Пуши приходят даже при закрытом приложении (если подписка активна и браузер разрешил).
      void (async () => {
        try {
        const memberIds = await svc.getConversationMemberIds(convKey);
        const recipients = memberIds.filter((id) => Number(id) !== Number(userId));
        const senderName = (message as any)?.sender_name ?? 'Новое сообщение';
        const ptype = String((message as any)?.payload_type ?? 'text');
        const bodyText =
          String((message as any)?.content ?? '').trim() ||
          (ptype === 'poll'
            ? '📊 Опрос'
            : ptype !== 'text'
              ? 'Вложение'
              : 'Новое сообщение');
        const mpl = (message as any)?.payload as Record<string, unknown> | undefined;
        const mentionIds = Array.isArray(mpl?.mention_member_ids)
          ? (mpl.mention_member_ids as unknown[])
              .map((x) => Number(x))
              .filter((n) => Number.isFinite(n) && n > 0)
          : [];
        const mentionSet = new Set(mentionIds);
        let chatLabel = 'Чат';
        try {
          const cmeta = await svc.getConversationMeta(convKey);
          if (cmeta?.title?.trim()) chatLabel = cmeta.title.trim();
          else if (cmeta?.type === 'group') chatLabel = 'Группа';
          else if (cmeta?.type === 'channel') chatLabel = 'Канал';
        } catch {
          /* ignore */
        }
        const previewShort =
          bodyText.length > 160 ? `${bodyText.slice(0, 157).trim()}…` : bodyText;

        const batchSize = 8;
        for (let i = 0; i < recipients.length; i += batchSize) {
          const batch = recipients.slice(i, i + batchSize);
          await Promise.allSettled(batch.map(async (rid) => {
          const r = Number(rid);
          if (await svc.isConversationMutedForMember(convKey, r)) return;
          const mentioned = mentionSet.has(r);
          const payload = {
            title: mentioned ? `Вас упомянули в «${chatLabel}»` : senderName,
            body: mentioned ? `${senderName}: ${previewShort || 'Сообщение'}` : bodyText,
            conversationId: convKey,
            messageId: String((message as any)?.id ?? ''),
            url: resolveMessengerConversationDeepLink(convKey),
            tag: `chat-${convKey}`,
            renotify: true,
            badge: '/assets/pwa-64x64.png',
            icon: '/assets/pwa-192x192.png',
            actions: [
              { action: 'reply', title: 'Ответить' },
              { action: 'dismiss', title: 'Закрыть' },
            ],
          };
          await sendPushNotification(r, payload);
          }));
        }
        } catch (e) {
          console.warn('[messenger] push notify failed (best-effort):', e);
        }
      })();
    } catch (e) {
      const obj: Record<string, unknown> | null = e && typeof e === 'object' ? (e as Record<string, unknown>) : null;
      const message =
        e instanceof Error ? e.message : (typeof obj?.message === 'string' ? obj.message : String(e));
      const code = typeof obj?.code === 'string' ? obj.code : undefined;
      const detail = typeof obj?.detail === 'string' ? obj.detail : undefined;
      const hint = typeof obj?.hint === 'string' ? obj.hint : undefined;

      if (
        e instanceof Error &&
        (/^Poll\b|^Invalid poll/i.test(message) ||
          message.includes('option') ||
          message.includes('question'))
      ) {
        res.status(400).json({ error: message });
        return;
      }

      // Helpful for DB errors without leaking request body contents.
      console.error('[messenger] sendMessage error:', { message, code, detail, hint });
      res.status(500).json({
        error: 'Failed to send message',
        ...(code ? { dbCode: code } : {}),
      });
    }
  },
);

/** POST /api/messenger/messages/:id/poll-vote { optionIndexes: number[] } */
router.post(
  '/messages/:id/poll-vote',
  checkChatPermission('send_message'),
  async (req: Request, res: Response) => {
    const userId = (req as AuthReq).authUserId!;
    const msgId = req.params.id;
    const raw = req.body?.optionIndexes;
    const optionIndexes = Array.isArray(raw) ? raw.map((x) => Number(x)) : [];
    if (raw != null && !Array.isArray(raw)) {
      res.status(400).json({ error: 'optionIndexes must be an array' });
      return;
    }
    try {
      const result = await svc.votePollMessage(msgId, userId, optionIndexes);
      const ck = result.conversationId;
      sendToRoomAll(ck, {
        type: 'msg:poll',
        conversationId: ck,
        messageId: String(msgId),
        tallies: result.tallies,
      });
      res.json({ tallies: result.tallies, my_options: result.my_options });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === 'Forbidden') {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      if (message === 'Message not found' || message === 'Not a poll message' || message === 'Invalid message id') {
        res.status(404).json({ error: message });
        return;
      }
      if (
        message === 'Invalid poll' ||
        message === 'This poll allows only one answer' ||
        message.includes('answer')
      ) {
        res.status(400).json({ error: message });
        return;
      }
      console.error('[messenger] poll-vote error:', e);
      res.status(500).json({ error: 'Failed to record vote' });
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
    const updated = await svc.markRead(convId, userId, messageId);
    if (updated) {
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
    }
    res.json({ ok: true, updated });
  } catch (e) {
    console.error('[messenger] markRead error:', e);
    const message = e instanceof Error ? e.message : String(e);
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
    const message = e instanceof Error ? e.message : String(e);
    if (message === 'Forbidden') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (message === 'Message not found') {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
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
    const message = e instanceof Error ? e.message : String(e);
    if (message === 'Forbidden') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (message === 'Message not found') {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
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

/** GET /api/messenger/search?q=...&limit=30 — global search across all user's conversations */
router.get('/search', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const searchQuery = (req.query.q as string || '').trim();
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 30));

  if (!searchQuery) {
    res.status(400).json({ error: 'Search query is required' });
    return;
  }

  try {
    const results = await svc.searchAllMessages(searchQuery, userId, limit);
    res.json(results);
  } catch (e) {
    console.error('[messenger] searchAllMessages error:', e);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

export default router;
