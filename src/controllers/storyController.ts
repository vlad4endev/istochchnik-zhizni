import path from 'node:path';
import type { Request, Response } from 'express';
import {
  createStory,
  deleteStoryAsOwner,
  listActiveStories,
  markStoryViewed,
  replyToStory,
} from '../services/storyService';
import type { MediaType } from '../services/profileService';
import {
  buildUserMediaProfilePath,
  getSupabaseStorageMissingEnv,
  isSupabaseStorageConfigured,
  uploadBufferToPublicBucket,
  userMediaBucket,
} from '../lib/supabaseStorage';
import {
  ensureMemberInRoom,
  sendToMember,
  sendToRoomAll,
} from '../realtime/wsHub';
import { sendPushNotification } from '../services/pushService';
import * as messengerSvc from '../services/messengerService';
import { resolveMessengerConversationDeepLink } from '../config/messengerPublic';

type AuthReq = Request & { authUserId?: number };

function inferMediaTypeFromMimetype(mt: string): MediaType {
  const m = (mt || '').toLowerCase();
  return m.startsWith('video/') ? 'video' : 'image';
}

export async function getStories(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthReq).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const groups = await listActiveStories(authUserId);
    res.json({ groups });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[stories] list error:', msg, e);
    res.status(500).json({ error: 'Не удалось загрузить истории' });
  }
}

export async function postCreateStory(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthReq).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const caption =
    typeof req.body?.caption === 'string' && req.body.caption.trim()
      ? req.body.caption.trim()
      : null;

  const files = (req as Request & { files?: Express.Multer.File[] }).files;
  const file = Array.isArray(files) && files.length > 0 ? files[0] : undefined;

  try {
    if (file) {
      if (!isSupabaseStorageConfigured()) {
        res.status(503).json({
          error: 'Хранилище файлов не настроено (нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY)',
          code: 'supabase_not_configured',
          missingEnv: getSupabaseStorageMissingEnv(),
        });
        return;
      }
      const buf = file.buffer;
      if (!buf || !buf.length) {
        res.status(400).json({ error: 'Пустой файл' });
        return;
      }
      const ext = path.extname(file.originalname || '') || '';
      const safeExt = ext && ext.length <= 12 ? ext.toLowerCase() : '';
      const mime = String(file.mimetype || 'application/octet-stream').toLowerCase();
      const objectPath = buildUserMediaProfilePath(authUserId, safeExt).replace(
        'profile-media/',
        'story-media/',
      );
      const { publicUrl } = await uploadBufferToPublicBucket({
        bucket: userMediaBucket(),
        objectPath,
        file: buf,
        contentType: mime,
        cacheControl: 'public, max-age=86400',
        metadata: {
          kind: 'story-media',
          uploadedBy: String(authUserId),
        },
      });
      const created = await createStory({
        memberId: authUserId,
        mediaUrl: publicUrl,
        mediaType: inferMediaTypeFromMimetype(file.mimetype),
        caption,
      });
      res.status(201).json(created);
      return;
    }

    const mediaUrl = typeof req.body?.media_url === 'string' ? req.body.media_url.trim() : '';
    const mediaType: MediaType =
      req.body?.media_type === 'video' ? 'video' : req.body?.media_type === 'image' ? 'image' : 'image';
    if (!mediaUrl) {
      res.status(400).json({ error: 'Загрузите файл или укажите media_url' });
      return;
    }
    const created = await createStory({
      memberId: authUserId,
      mediaUrl,
      mediaType,
      caption,
    });
    res.status(201).json(created);
  } catch (e) {
    console.error('[stories] create error:', e);
    const msg = e instanceof Error ? e.message : 'Failed to create story';
    res.status(400).json({ error: msg });
  }
}

export async function postStoryView(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthReq).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const storyId = String(req.params.id ?? '').trim();
  if (!storyId) {
    res.status(400).json({ error: 'Invalid story id' });
    return;
  }
  try {
    const ok = await markStoryViewed(storyId, authUserId);
    if (!ok) {
      res.status(404).json({ error: 'Сторис не найдена или истекла' });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[stories] view error:', e);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function deleteStory(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthReq).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const storyId = String(req.params.id ?? '').trim();
  if (!storyId) {
    res.status(400).json({ error: 'Invalid story id' });
    return;
  }
  try {
    const ok = await deleteStoryAsOwner(storyId, authUserId);
    if (!ok) {
      res.status(404).json({ error: 'Сторис не найдена или нет доступа' });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[stories] delete error:', e);
    res.status(500).json({ error: 'Database error' });
  }
}

/** POST /api/stories/:id/reply { text?, reaction? } — ответ уходит в личный чат. */
export async function postStoryReply(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthReq).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const storyId = String(req.params.id ?? '').trim();
  if (!storyId) {
    res.status(400).json({ error: 'Invalid story id' });
    return;
  }
  const text = typeof req.body?.text === 'string' ? req.body.text : null;
  const reaction = typeof req.body?.reaction === 'string' ? req.body.reaction : null;

  try {
    const { conversationId, message } = await replyToStory({
      storyId,
      fromMemberId: authUserId,
      text,
      reaction,
    });
    const convKey = String(conversationId);
    const authorId = Number(
      (message.payload as { story_author_id?: unknown } | undefined)?.story_author_id,
    );

    ensureMemberInRoom(authUserId, convKey);
    if (Number.isFinite(authorId) && authorId > 0) {
      ensureMemberInRoom(authorId, convKey);
      try {
        const convForAuthor = await messengerSvc.getConversationListItem(authorId, convKey);
        if (convForAuthor) {
          sendToMember(authorId, { type: 'conv:created', conversation: convForAuthor });
        }
      } catch {
        /* best-effort */
      }
    }

    const messageForRealtime = { ...message, is_read: false as const };
    sendToRoomAll(convKey, {
      type: 'msg:new',
      conversationId: convKey,
      message: messageForRealtime,
    });

    res.status(201).json({
      ok: true,
      conversationId: convKey,
      message: messageForRealtime,
    });

    void (async () => {
      try {
        if (!Number.isFinite(authorId) || authorId <= 0) return;
        if (await messengerSvc.isConversationMutedForMember(convKey, authorId)) return;
        const senderName = message.sender_name ?? 'Новое сообщение';
        const bodyText =
          String(message.content ?? '').trim() || '↩️ Ответ на историю';
        await sendPushNotification(authorId, {
          title: senderName,
          body: bodyText,
          senderName,
          conversationId: convKey,
          messageId: String(message.id ?? ''),
          url: resolveMessengerConversationDeepLink(convKey),
          tag: `chat-${convKey}`,
          renotify: true,
          badge: '/assets/pwa-64x64.png',
          icon: '/assets/pwa-192x192.png',
          actions: [
            { action: 'reply', title: 'Ответить' },
            { action: 'dismiss', title: 'Закрыть' },
          ],
        });
      } catch (e) {
        console.warn('[stories] reply push failed (best-effort):', e);
      }
    })();
  } catch (e) {
    const code =
      e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code ?? '') : '';
    const msg = e instanceof Error ? e.message : 'Failed to reply';
    if (code === 'not_found') {
      res.status(404).json({ error: msg });
      return;
    }
    if (
      code === 'empty_reply' ||
      code === 'text_too_long' ||
      code === 'bad_reaction' ||
      code === 'self_reply'
    ) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[stories] reply error:', e);
    res.status(500).json({ error: 'Не удалось отправить ответ' });
  }
}
