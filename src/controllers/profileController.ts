import path from 'node:path';
import type { Request, Response } from 'express';
import {
  addComment,
  createPost,
  createRepost,
  deleteCommentAsOwnerOrAdmin,
  deletePostAsOwner,
  getChurchFeed,
  getFeedUnreadCount,
  getProfileWithFeed,
  getProfileWithFeedByUsername,
  likeComment,
  likePost,
  listComments,
  listPostLikers,
  markFeedSeen,
  patchMyProfileSettings,
  unlikeComment,
  unlikePost,
  updatePostCaptionAsOwner,
  type MediaType,
} from '../services/profileService';
import {
  notifyPostCommented,
  notifyPostLiked,
  notifyPostReposted,
} from '../services/feedInteractionNotifyService';
import {
  buildUserMediaProfilePath,
  getSupabaseStorageMissingEnv,
  isSupabaseStorageConfigured,
  uploadBufferToPublicBucket,
  userMediaBucket,
} from '../lib/supabaseStorage';

type AuthReq = Request & { authUserId?: number };

function parsePositiveInt(raw: unknown): number | null {
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function normalizeCaption(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

function inferMediaTypeFromMimetype(mt: string): MediaType {
  const m = (mt || '').toLowerCase();
  return m.startsWith('video/') ? 'video' : 'image';
}

export async function getProfile(req: Request, res: Response): Promise<void> {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid profile id' });
    return;
  }
  try {
    const viewerId = (req as AuthReq).authUserId;
    const data = await getProfileWithFeed(id, viewerId);
    if (!data) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    res.json(data);
  } catch (e) {
    console.error('[profile] getProfile error:', e);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function getProfileByUsername(req: Request, res: Response): Promise<void> {
  let raw = String(req.params.username ?? '').trim();
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }
  if (!raw) {
    res.status(400).json({ error: 'Invalid username' });
    return;
  }
  try {
    const viewerId = (req as AuthReq).authUserId;
    const data = await getProfileWithFeedByUsername(raw, viewerId);
    if (!data) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    res.json(data);
  } catch (e) {
    console.error('[profile] getProfileByUsername error:', e);
    res.status(500).json({ error: 'Database error' });
  }
}

/**
 * POST /posts
 * Supports:
 * - application/json: { caption?, media: [{ url, type, order? }] }
 * - multipart/form-data: caption? + media[]=files (handled by middleware)
 */
export async function postCreatePost(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthReq).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const caption = normalizeCaption(req.body?.caption);

  const files = (req as Request & { files?: Express.Multer.File[] }).files;
  try {
    if (Array.isArray(files) && files.length > 0) {
      if (!isSupabaseStorageConfigured()) {
        res.status(503).json({
          error: 'Хранилище файлов не настроено (нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY)',
          code: 'supabase_not_configured',
          missingEnv: getSupabaseStorageMissingEnv(),
        });
        return;
      }
      const uploads: { url: string; type: MediaType; order: number }[] = [];
      for (let idx = 0; idx < files.length; idx += 1) {
        const f = files[idx];
        const buf = f.buffer;
        if (!buf || !buf.length) {
          res.status(400).json({ error: 'Пустой файл в загрузке' });
          return;
        }
        const ext = path.extname(f.originalname || '') || '';
        const safeExt = ext && ext.length <= 12 ? ext.toLowerCase() : '';
        const mime = String(f.mimetype || 'application/octet-stream').toLowerCase();
        let url: string;
        try {
          const objectPath = buildUserMediaProfilePath(authUserId, safeExt);
          const { publicUrl } = await uploadBufferToPublicBucket({
            bucket: userMediaBucket(),
            objectPath,
            file: buf,
            contentType: mime,
            cacheControl: 'public, max-age=31536000, immutable',
            metadata: {
              kind: 'profile-media',
              uploadedBy: String(authUserId),
            },
          });
          url = publicUrl;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error('[profile] media upload failed:', msg);
          res.status(502).json({
            error: 'Не удалось сохранить файл в хранилище',
            code: 'storage_upload',
          });
          return;
        }
        uploads.push({
          url,
          type: inferMediaTypeFromMimetype(f.mimetype),
          order: idx,
        });
      }
      const created = await createPost({ kind: 'uploads', memberId: authUserId, caption, uploads });
      res.status(201).json({ id: created.id, media: uploads });
      return;
    }

    const mediaRaw = req.body?.media;
    if (mediaRaw !== undefined && !Array.isArray(mediaRaw)) {
      res.status(400).json({ error: 'Field "media" must be an array (or upload files as multipart field "media")' });
      return;
    }
    const media = Array.isArray(mediaRaw)
      ? mediaRaw
          .map((m: unknown, idx: number) => {
            const item = m && typeof m === 'object' ? (m as Record<string, unknown>) : {};
            const url = typeof item.url === 'string' ? item.url.trim() : '';
            const type = item.type === 'video' ? 'video' : item.type === 'image' ? 'image' : null;
            const order = parsePositiveInt(item.order) ?? idx;
            if (!url || !type) return null;
            return { url, type, order };
          })
          .filter((x): x is { url: string; type: MediaType; order: number } => x !== null)
      : [];

    if (media.length === 0) {
      const textBody = typeof req.body?.caption === 'string' ? req.body.caption.trim() : '';
      if (textBody.length > 0) {
        const created = await createPost({ kind: 'text', memberId: authUserId, caption: textBody });
        res.status(201).json({ id: created.id });
        return;
      }
      res.status(400).json({ error: 'Добавьте текст, медиа или загрузите файлы' });
      return;
    }

    const created = await createPost({ kind: 'urls', memberId: authUserId, caption, media });
    res.status(201).json({ id: created.id });
  } catch (e) {
    console.error('[profile] createPost error:', e);
    const msg = e instanceof Error ? e.message : 'Failed to create post';
    res.status(400).json({ error: msg });
  }
}

export async function patchProfileSettings(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthReq).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    await patchMyProfileSettings(authUserId, {
      is_private: typeof body.is_private === 'boolean' ? body.is_private : undefined,
      allow_comments:
        body.allow_comments === 'public' || body.allow_comments === 'followers' || body.allow_comments === 'private'
          ? body.allow_comments
          : undefined,
      show_activity_status:
        typeof body.show_activity_status === 'boolean' ? body.show_activity_status : undefined,
      theme_mode: body.theme_mode === 'system' || body.theme_mode === 'light' || body.theme_mode === 'dark' ? body.theme_mode : undefined,
      theme_accent_color:
        typeof body.theme_accent_color === 'string' || body.theme_accent_color === null
          ? body.theme_accent_color
          : undefined,
      display_name:
        typeof body.display_name === 'string' || body.display_name === null
          ? body.display_name
          : undefined,
      bio: typeof body.bio === 'string' || body.bio === null ? body.bio : undefined,
      avatar_url:
        typeof body.avatar_url === 'string' || body.avatar_url === null
          ? body.avatar_url
          : undefined,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[profile] patchProfileSettings error:', e);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function postRepost(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthReq).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const postId = String(req.params.id ?? '').trim();
  if (!postId) {
    res.status(400).json({ error: 'Invalid post id' });
    return;
  }
  const caption = normalizeCaption(req.body?.caption);
  try {
    const created = await createRepost(authUserId, postId, caption);
    res.status(201).json({ ok: true, id: created.id });
    void notifyPostReposted(postId, authUserId).catch((e) => {
      console.warn('[profile] repost push failed (best-effort):', e);
    });
  } catch (e) {
    console.error('[profile] repost error:', e);
    const msg = e instanceof Error ? e.message : 'Failed to repost';
    const code = msg.includes('не найден') ? 404 : msg.includes('уже') ? 409 : 400;
    res.status(code).json({ error: msg });
  }
}

export async function deleteLike(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthReq).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const postId = String(req.params.id ?? '').trim();
  if (!postId) {
    res.status(400).json({ error: 'Invalid post id' });
    return;
  }
  try {
    const r = await unlikePost(postId, authUserId);
    res.json({ ok: true, like_count: r.like_count, removed: r.removed });
  } catch (e) {
    console.error('[profile] unlike error:', e);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function postLike(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthReq).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const postId = String(req.params.id ?? '').trim();
  if (!postId) {
    res.status(400).json({ error: 'Invalid post id' });
    return;
  }
  try {
    const r = await likePost(postId, authUserId);
    res.json({ ok: true, like_count: r.like_count, inserted: r.inserted });
    if (r.inserted) {
      void notifyPostLiked(postId, authUserId).catch((e) => {
        console.warn('[profile] like push failed (best-effort):', e);
      });
    }
  } catch (e) {
    console.error('[profile] like error:', e);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function getPostLikers(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthReq).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const postId = String(req.params.id ?? '').trim();
  if (!postId) {
    res.status(400).json({ error: 'Invalid post id' });
    return;
  }
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
  const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 40;
  try {
    const data = await listPostLikers({
      postId,
      cursor,
      limit: Number.isFinite(limitRaw) ? limitRaw : 40,
    });
    res.json(data);
  } catch (e) {
    console.error('[profile] list likers error:', e);
    const msg = e instanceof Error ? e.message : 'Failed to load likers';
    const code = msg.includes('не найдена') ? 404 : 500;
    res.status(code).json({ error: code === 404 ? msg : 'Database error' });
  }
}

export async function getFeed(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthReq).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
  const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 20;
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'smart';
  try {
    const data = await getChurchFeed({
      viewerMemberId: authUserId,
      cursor,
      limit: Number.isFinite(limitRaw) ? limitRaw : 20,
      sort,
    });
    res.json(data);
  } catch (e) {
    console.error('[profile] getFeed error:', e);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function getFeedUnread(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthReq).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const count = await getFeedUnreadCount(authUserId);
    res.json({ count });
  } catch (e) {
    console.error('[profile] getFeedUnread error:', e);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function postFeedMarkSeen(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthReq).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const body = req.body as { seen_at?: unknown } | undefined;
  const seenAt =
    typeof body?.seen_at === 'string' && body.seen_at.trim().length > 0 ? body.seen_at.trim() : null;
  try {
    const data = await markFeedSeen(authUserId, seenAt);
    res.json({ ok: true, ...data });
  } catch (e) {
    console.error('[profile] postFeedMarkSeen error:', e);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function getPostComments(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthReq).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const postId = String(req.params.id ?? '').trim();
  if (!postId) {
    res.status(400).json({ error: 'Invalid post id' });
    return;
  }
  try {
    const comments = await listComments(postId, authUserId);
    res.json({ comments });
  } catch (e) {
    console.error('[profile] getComments error:', e);
    const msg = e instanceof Error ? e.message : 'Database error';
    if (msg.includes('не найдена')) {
      res.status(404).json({ error: msg });
      return;
    }
    if (msg.includes('недоступны')) {
      res.status(403).json({ error: msg });
      return;
    }
    res.status(500).json({ error: 'Database error' });
  }
}

export async function postComment(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthReq).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const postId = String(req.params.id ?? '').trim();
  if (!postId) {
    res.status(400).json({ error: 'Invalid post id' });
    return;
  }
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) {
    res.status(400).json({ error: 'Field "text" is required' });
    return;
  }
  if (text.length > 2000) {
    res.status(400).json({ error: 'Comment is too long (max 2000 chars)' });
    return;
  }
  try {
    const created = await addComment(postId, authUserId, text);
    res.status(201).json({ ok: true, id: created.id, created_at: created.created_at });
    void notifyPostCommented(postId, authUserId, text).catch((e) => {
      console.warn('[profile] comment push failed (best-effort):', e);
    });
  } catch (e) {
    console.error('[profile] comment error:', e);
    const msg = e instanceof Error ? e.message : 'Database error';
    if (msg.includes('не найдена')) {
      res.status(404).json({ error: msg });
      return;
    }
    if (msg.includes('недоступны')) {
      res.status(403).json({ error: msg });
      return;
    }
    res.status(500).json({ error: 'Database error' });
  }
}

export async function deleteComment(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthReq).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const postId = String(req.params.id ?? '').trim();
  const commentId = String(req.params.commentId ?? '').trim();
  if (!postId || !commentId) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const role = String((req as AuthReq & { authUserRole?: string }).authUserRole ?? '').toLowerCase();
  const roles = (req as AuthReq & { authUserRoles?: string[] }).authUserRoles ?? [];
  const isAdmin = role === 'admin' || roles.includes('admin');
  try {
    const ok = await deleteCommentAsOwnerOrAdmin(postId, commentId, authUserId, isAdmin);
    if (!ok) {
      res.status(404).json({ error: 'Комментарий не найден или нет доступа' });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[profile] deleteComment error:', e);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function postCommentLike(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthReq).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const postId = String(req.params.id ?? '').trim();
  const commentId = String(req.params.commentId ?? '').trim();
  if (!postId || !commentId) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const r = await likeComment(postId, commentId, authUserId);
    res.json({ ok: true, like_count: r.like_count });
  } catch (e) {
    console.error('[profile] commentLike error:', e);
    const msg = e instanceof Error ? e.message : 'Database error';
    if (msg.includes('не найден')) {
      res.status(404).json({ error: msg });
      return;
    }
    if (msg.includes('недоступны')) {
      res.status(403).json({ error: msg });
      return;
    }
    res.status(500).json({ error: 'Database error' });
  }
}

export async function deleteCommentLike(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthReq).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const postId = String(req.params.id ?? '').trim();
  const commentId = String(req.params.commentId ?? '').trim();
  if (!postId || !commentId) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const r = await unlikeComment(postId, commentId, authUserId);
    res.json({ ok: true, like_count: r.like_count });
  } catch (e) {
    console.error('[profile] commentUnlike error:', e);
    const msg = e instanceof Error ? e.message : 'Database error';
    if (msg.includes('недоступны')) {
      res.status(403).json({ error: msg });
      return;
    }
    res.status(500).json({ error: 'Database error' });
  }
}

export async function patchPost(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthReq).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const postId = String(req.params.id ?? '').trim();
  if (!postId) {
    res.status(400).json({ error: 'Invalid post id' });
    return;
  }
  try {
    const caption = req.body?.caption;
    await updatePostCaptionAsOwner(postId, authUserId, caption);
    res.json({ ok: true });
  } catch (e) {
    console.error('[profile] patchPost error:', e);
    const msg = e instanceof Error ? e.message : 'Ошибка сохранения';
    if (msg.includes('не найден') || msg.includes('нет доступа')) {
      res.status(404).json({ error: msg });
      return;
    }
    res.status(400).json({ error: msg });
  }
}

export async function deletePost(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthReq).authUserId;
  if (!authUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const postId = String(req.params.id ?? '').trim();
  if (!postId) {
    res.status(400).json({ error: 'Invalid post id' });
    return;
  }
  try {
    const ok = await deletePostAsOwner(postId, authUserId);
    if (!ok) {
      res.status(404).json({ error: 'Публикация не найдена или нет доступа' });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[profile] deletePost error:', e);
    res.status(500).json({ error: 'Database error' });
  }
}

