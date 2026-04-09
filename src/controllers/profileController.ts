import type { Request, Response } from 'express';
import {
  addComment,
  createPost,
  createRepost,
  getProfileWithFeed,
  getProfileWithFeedByUsername,
  likePost,
  patchMyProfileSettings,
  unlikePost,
  type MediaType,
} from '../services/profileService';

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
      const uploads = files.map((f, idx) => ({
        url: `/uploads/profile-media/${f.filename}`,
        type: inferMediaTypeFromMimetype(f.mimetype),
        order: idx,
      }));
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
          .map((m: any, idx: number) => {
            const url = typeof m?.url === 'string' ? m.url.trim() : '';
            const type = m?.type === 'video' ? 'video' : m?.type === 'image' ? 'image' : null;
            const order = parsePositiveInt(m?.order) ?? idx;
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
      theme_accent_color: body.theme_accent_color === undefined ? undefined : (body.theme_accent_color as any),
      display_name: body.display_name === undefined ? undefined : (body.display_name as any),
      bio: body.bio === undefined ? undefined : (body.bio as any),
      avatar_url: body.avatar_url === undefined ? undefined : (body.avatar_url as any),
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
  } catch (e) {
    console.error('[profile] like error:', e);
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
  } catch (e) {
    console.error('[profile] comment error:', e);
    res.status(500).json({ error: 'Database error' });
  }
}

