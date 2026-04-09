import { query } from '../config/db';

export type PrivacyLevel = 'public' | 'followers' | 'private';
export type ThemeMode = 'system' | 'light' | 'dark';
export type MediaType = 'image' | 'video';

export type ProfilePostAuthor = {
  member_id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

/** Содержимое оригинальной публикации внутри репоста. */
export type ProfilePostEmbedded = {
  id: string;
  member_id: number;
  author: ProfilePostAuthor;
  caption: string | null;
  created_at: string;
  media: Array<{ url: string; type: MediaType; order: number }>;
  like_count: number;
  comment_count: number;
  repost_count: number;
};

export type ProfileView = {
  profile: {
    member_id: number;
    username: string;
    display_name: string | null;
    bio: string | null;
    avatar_url: string | null;
    is_private: boolean;
    allow_comments: PrivacyLevel;
    show_activity_status: boolean;
    theme_mode: ThemeMode;
    theme_accent_color: string | null;
    created_at: string;
    updated_at: string;
  };
  posts: Array<{
    id: string;
    member_id: number;
    caption: string | null;
    created_at: string;
    media: Array<{ url: string; type: MediaType; order: number }>;
    like_count: number;
    comment_count: number;
    repost_count: number;
    liked_by_me: boolean;
    reposted_by_me: boolean;
    shared_post: ProfilePostEmbedded | null;
  }>;
};

const CAPTION_MAX_LEN = 8000;

async function ensureProfileRow(memberId: number): Promise<void> {
  await query(
    `INSERT INTO user_profiles (member_id, username)
     VALUES ($1, $2)
     ON CONFLICT (member_id) DO NOTHING`,
    [memberId, `member-${memberId}`],
  );
}

/** Следовать по цепочке репостов к корневой публикации (макс. глубина защита от циклов). */
export async function resolveRepostRoot(postId: string): Promise<string> {
  let current = postId;
  for (let depth = 0; depth < 24; depth += 1) {
    const r = await query(
      `SELECT shared_post_id::text AS sid FROM profile_posts WHERE id = $1::bigint`,
      [current],
    );
    const row = r.rows[0] as { sid?: string | null } | undefined;
    const sid = row?.sid;
    if (!sid) return current;
    current = sid;
  }
  return current;
}

async function loadMediaMap(postIds: string[]): Promise<Map<string, Array<{ url: string; type: MediaType; order: number }>>> {
  const mediaByPost = new Map<string, Array<{ url: string; type: MediaType; order: number }>>();
  if (postIds.length === 0) return mediaByPost;
  const mediaRes = await query(
    `SELECT
      post_id::text AS post_id,
      url,
      type::text AS type,
      sort_order
     FROM profile_post_media
     WHERE post_id = ANY($1::bigint[])
     ORDER BY post_id ASC, sort_order ASC, id ASC`,
    [postIds.map((id) => BigInt(id))],
  );
  for (const row of mediaRes.rows as Array<{
    post_id: string;
    url: string;
    type: string;
    sort_order: number;
  }>) {
    const list = mediaByPost.get(row.post_id) ?? [];
    list.push({
      url: row.url,
      type: row.type === 'video' ? 'video' : 'image',
      order: Number(row.sort_order ?? 0),
    });
    mediaByPost.set(row.post_id, list);
  }
  return mediaByPost;
}

type CountRow = { post_id: string; like_count: number; comment_count: number; repost_count: number };

async function loadAggregatesForPostIds(postIds: string[]): Promise<Map<string, CountRow>> {
  const map = new Map<string, CountRow>();
  if (postIds.length === 0) return map;
  const bigints = postIds.map((id) => BigInt(id));
  const [likesRes, commentsRes, repostsRes] = await Promise.all([
    query(
      `SELECT post_id::text AS post_id, COUNT(*)::int AS c
       FROM profile_post_likes WHERE post_id = ANY($1::bigint[]) GROUP BY post_id`,
      [bigints],
    ),
    query(
      `SELECT post_id::text AS post_id, COUNT(*)::int AS c
       FROM profile_post_comments WHERE post_id = ANY($1::bigint[]) GROUP BY post_id`,
      [bigints],
    ),
    query(
      `SELECT shared_post_id::text AS post_id, COUNT(*)::int AS c
       FROM profile_posts
       WHERE shared_post_id IS NOT NULL AND shared_post_id = ANY($1::bigint[])
       GROUP BY shared_post_id`,
      [bigints],
    ),
  ]);
  const merge = (postId: string, field: 'like_count' | 'comment_count' | 'repost_count', val: number) => {
    const prev = map.get(postId) ?? {
      post_id: postId,
      like_count: 0,
      comment_count: 0,
      repost_count: 0,
    };
    prev[field] = val;
    map.set(postId, prev);
  };
  for (const row of likesRes.rows as Array<{ post_id: string; c: number }>) {
    merge(row.post_id, 'like_count', Number(row.c ?? 0));
  }
  for (const row of commentsRes.rows as Array<{ post_id: string; c: number }>) {
    merge(row.post_id, 'comment_count', Number(row.c ?? 0));
  }
  for (const row of repostsRes.rows as Array<{ post_id: string; c: number }>) {
    merge(row.post_id, 'repost_count', Number(row.c ?? 0));
  }
  return map;
}

async function loadAuthorsForMemberIds(memberIds: number[]): Promise<Map<number, ProfilePostAuthor>> {
  const map = new Map<number, ProfilePostAuthor>();
  const uniq = [...new Set(memberIds)].filter((n) => Number.isInteger(n) && n > 0);
  if (uniq.length === 0) return map;
  const res = await query(
    `SELECT
      up.member_id,
      up.username,
      COALESCE(
        NULLIF(TRIM(up.display_name), ''),
        NULLIF(TRIM(CONCAT(COALESCE(m.first_name, ''), ' ', COALESCE(m.last_name, ''))), ''),
        NULLIF(TRIM(m.name), '')
      ) AS display_name,
      COALESCE(up.avatar_url, m.avatar_url) AS avatar_url
     FROM user_profiles up
     INNER JOIN members m ON m.id = up.member_id
     WHERE up.member_id = ANY($1::int[])`,
    [uniq],
  );
  for (const row of res.rows as Array<{
    member_id: number;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  }>) {
    map.set(row.member_id, {
      member_id: row.member_id,
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
    });
  }
  return map;
}

async function buildEmbeddedPosts(postIds: string[]): Promise<Map<string, ProfilePostEmbedded>> {
  const out = new Map<string, ProfilePostEmbedded>();
  if (postIds.length === 0) return out;
  const postsRes = await query(
    `SELECT
      p.id::text AS id,
      p.member_id,
      p.caption,
      p.created_at::text AS created_at
     FROM profile_posts p
     WHERE p.id = ANY($1::bigint[])`,
    [postIds.map((id) => BigInt(id))],
  );
  const rows = postsRes.rows as Array<{
    id: string;
    member_id: number;
    caption: string | null;
    created_at: string;
  }>;
  const memberIds = rows.map((r) => r.member_id);
  const [mediaMap, aggMap, authors] = await Promise.all([
    loadMediaMap(postIds),
    loadAggregatesForPostIds(postIds),
    loadAuthorsForMemberIds(memberIds),
  ]);
  for (const row of rows) {
    const author = authors.get(row.member_id);
    if (!author) continue;
    const counts = aggMap.get(row.id) ?? {
      post_id: row.id,
      like_count: 0,
      comment_count: 0,
      repost_count: 0,
    };
    out.set(row.id, {
      id: row.id,
      member_id: row.member_id,
      author,
      caption: row.caption,
      created_at: row.created_at,
      media: mediaMap.get(row.id) ?? [],
      like_count: counts.like_count,
      comment_count: counts.comment_count,
      repost_count: counts.repost_count,
    });
  }
  return out;
}

export async function getProfileWithFeed(memberId: number, viewerMemberId?: number): Promise<ProfileView | null> {
  await ensureProfileRow(memberId);
  const prof = await query(
    `SELECT
      up.member_id,
      up.username,
      COALESCE(
        NULLIF(TRIM(up.display_name), ''),
        NULLIF(TRIM(CONCAT(COALESCE(m.first_name, ''), ' ', COALESCE(m.last_name, ''))), ''),
        NULLIF(TRIM(m.name), '')
      ) AS display_name,
      up.bio,
      COALESCE(up.avatar_url, m.avatar_url) AS avatar_url,
      up.is_private,
      up.allow_comments,
      up.show_activity_status,
      up.theme_mode,
      up.theme_accent_color,
      up.created_at::text AS created_at,
      up.updated_at::text AS updated_at
     FROM user_profiles up
     INNER JOIN members m ON m.id = up.member_id
     WHERE up.member_id = $1`,
    [memberId],
  );
  const profile = prof.rows[0] as ProfileView['profile'] | undefined;
  if (!profile) return null;

  const postsRes = await query(
    `SELECT
      p.id::text AS id,
      p.member_id,
      p.caption,
      p.created_at::text AS created_at,
      p.shared_post_id::text AS shared_post_id,
      COALESCE(l.like_count, 0)::int AS like_count,
      COALESCE(c.comment_count, 0)::int AS comment_count,
      COALESCE(rc.cnt, 0)::int AS repost_count
     FROM profile_posts p
     LEFT JOIN (
       SELECT post_id, COUNT(*)::int AS like_count
       FROM profile_post_likes
       GROUP BY post_id
     ) l ON l.post_id = p.id
     LEFT JOIN (
       SELECT post_id, COUNT(*)::int AS comment_count
       FROM profile_post_comments
       GROUP BY post_id
     ) c ON c.post_id = p.id
     LEFT JOIN (
       SELECT shared_post_id, COUNT(*)::int AS cnt
       FROM profile_posts
       WHERE shared_post_id IS NOT NULL
       GROUP BY shared_post_id
     ) rc ON rc.shared_post_id = p.id
     WHERE p.member_id = $1
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT 50`,
    [memberId],
  );

  const postRows = postsRes.rows as Array<{
    id: string;
    member_id: number;
    caption: string | null;
    created_at: string;
    shared_post_id: string | null;
    like_count: number;
    comment_count: number;
    repost_count: number;
  }>;

  const postIds = postRows.map((r) => r.id);
  const sharedIds = postRows.map((r) => r.shared_post_id).filter((x): x is string => !!x);
  const mediaByPost = await loadMediaMap(postIds);

  let likedSet = new Set<string>();
  let repostedRootSet = new Set<string>();
  if (viewerMemberId !== undefined && viewerMemberId > 0 && postIds.length > 0) {
    const lk = await query(
      `SELECT post_id::text AS post_id FROM profile_post_likes
       WHERE member_id = $1 AND post_id = ANY($2::bigint[])`,
      [viewerMemberId, postIds.map((id) => BigInt(id))],
    );
    likedSet = new Set((lk.rows as Array<{ post_id: string }>).map((x) => x.post_id));

    const rootIds = [
      ...new Set(
        postRows.map((r) => {
          const root = r.shared_post_id && r.shared_post_id.length > 0 ? r.shared_post_id : r.id;
          return root;
        }),
      ),
    ];
    if (rootIds.length > 0) {
      const rp = await query(
        `SELECT shared_post_id::text AS sid
         FROM profile_posts
         WHERE member_id = $1 AND shared_post_id = ANY($2::bigint[])`,
        [viewerMemberId, rootIds.map((id) => BigInt(id))],
      );
      repostedRootSet = new Set((rp.rows as Array<{ sid: string }>).map((x) => x.sid));
    }
  }

  const embeddedById = sharedIds.length > 0 ? await buildEmbeddedPosts([...new Set(sharedIds)]) : new Map<string, ProfilePostEmbedded>();

  const posts: ProfileView['posts'] = postRows.map((row) => {
    const sharedPost = row.shared_post_id ? embeddedById.get(row.shared_post_id) ?? null : null;
    const contentRootId = row.shared_post_id && row.shared_post_id.length > 0 ? row.shared_post_id : row.id;
    return {
      id: row.id,
      member_id: row.member_id,
      caption: row.caption,
      created_at: row.created_at,
      media: mediaByPost.get(row.id) ?? [],
      like_count: row.like_count,
      comment_count: row.comment_count,
      repost_count: row.repost_count,
      liked_by_me: likedSet.has(row.id),
      reposted_by_me: repostedRootSet.has(contentRootId),
      shared_post: sharedPost,
    };
  });

  return { profile, posts };
}

const USERNAME_MAX_LEN = 64;

/** Resolve `user_profiles.username` (case-insensitive) → same payload as `getProfileWithFeed`. */
export async function getProfileWithFeedByUsername(username: string, viewerMemberId?: number): Promise<ProfileView | null> {
  const u = username.trim();
  if (!u || u.length > USERNAME_MAX_LEN) return null;

  const found = await query(
    `SELECT member_id FROM user_profiles WHERE LOWER(username) = LOWER($1) LIMIT 1`,
    [u],
  );
  let mid = (found.rows[0] as { member_id?: unknown } | undefined)?.member_id;

  if (mid === undefined || mid === null) {
    const m = /^member-(\d+)$/i.exec(u);
    if (m) {
      const parsedId = Number(m[1]);
      if (Number.isInteger(parsedId) && parsedId > 0) {
        const mem = await query(`SELECT id FROM members WHERE id = $1 LIMIT 1`, [parsedId]);
        if (mem.rows.length === 0) return null;
        await ensureProfileRow(parsedId);
        mid = parsedId;
      }
    }
  }

  const memberId = typeof mid === 'number' ? mid : typeof mid === 'string' ? Number(mid) : NaN;
  if (!Number.isInteger(memberId) || memberId <= 0) return null;
  return getProfileWithFeed(memberId, viewerMemberId);
}

export type CreatePostInput =
  | {
      kind: 'urls';
      memberId: number;
      caption: string | null;
      media: Array<{ url: string; type: MediaType; order: number }>;
    }
  | {
      kind: 'uploads';
      memberId: number;
      caption: string | null;
      uploads: Array<{ url: string; type: MediaType; order: number }>;
    }
  | {
      kind: 'text';
      memberId: number;
      caption: string;
    };

function normalizeCaption(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

export async function createPost(input: CreatePostInput): Promise<{ id: string }> {
  if (input.kind === 'text') {
    const cap = input.caption.trim();
    if (!cap) throw new Error('Текст публикации не может быть пустым');
    if (cap.length > CAPTION_MAX_LEN) throw new Error(`Текст слишком длинный (макс. ${CAPTION_MAX_LEN} символов)`);
    const created = await query(
      `INSERT INTO profile_posts (member_id, caption)
       VALUES ($1, $2)
       RETURNING id::text AS id`,
      [input.memberId, cap],
    );
    const postId = (created.rows[0] as { id?: string } | undefined)?.id;
    if (!postId) throw new Error('Failed to create post');
    return { id: postId };
  }

  const media = input.kind === 'urls' ? input.media : input.uploads;
  if (!Array.isArray(media) || media.length === 0) {
    throw new Error('At least one media item is required');
  }

  const cap = normalizeCaption(input.caption);
  if (cap !== null && cap.length > CAPTION_MAX_LEN) {
    throw new Error(`Подпись слишком длинная (макс. ${CAPTION_MAX_LEN} символов)`);
  }

  const created = await query(
    `INSERT INTO profile_posts (member_id, caption)
     VALUES ($1, $2)
     RETURNING id::text AS id`,
    [input.memberId, cap],
  );
  const postId = (created.rows[0] as { id?: string } | undefined)?.id;
  if (!postId) {
    throw new Error('Failed to create post');
  }

  const sorted = [...media]
    .map((m, idx) => ({ ...m, _idx: idx }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a._idx - b._idx)
    .map((m, idx) => ({
      url: m.url,
      type: m.type,
      sort_order: idx,
    }));

  for (const item of sorted) {
    await query(
      `INSERT INTO profile_post_media (post_id, url, type, sort_order)
       VALUES ($1::bigint, $2, $3::profile_media_type, $4)`,
      [postId, item.url, item.type, item.sort_order],
    );
  }

  return { id: postId };
}

/**
 * Репост на корневую публикацию. Один репост одного оригинала на пользователя (уникальный индекс).
 */
export async function createRepost(memberId: number, sourcePostId: string, caption: string | null): Promise<{ id: string }> {
  const rootId = await resolveRepostRoot(sourcePostId);
  const exists = await query(`SELECT 1 FROM profile_posts WHERE id = $1::bigint`, [rootId]);
  if (exists.rows.length === 0) throw new Error('Публикация не найдена');

  const cap = normalizeCaption(caption);
  if (cap !== null && cap.length > CAPTION_MAX_LEN) {
    throw new Error(`Комментарий к репосту слишком длинный (макс. ${CAPTION_MAX_LEN} символов)`);
  }

  try {
    const created = await query(
      `INSERT INTO profile_posts (member_id, caption, shared_post_id)
       VALUES ($1, $2, $3::bigint)
       RETURNING id::text AS id`,
      [memberId, cap, rootId],
    );
    const postId = (created.rows[0] as { id?: string } | undefined)?.id;
    if (!postId) throw new Error('Failed to create repost');
    return { id: postId };
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === '23505') {
      throw new Error('Вы уже поделились этой публикацией');
    }
    throw e;
  }
}

export async function patchMyProfileSettings(
  memberId: number,
  input: Partial<{
    is_private: boolean;
    allow_comments: PrivacyLevel;
    show_activity_status: boolean;
    theme_mode: ThemeMode;
    theme_accent_color: string | null;
    display_name: string | null;
    bio: string | null;
    avatar_url: string | null;
  }>,
): Promise<void> {
  await ensureProfileRow(memberId);

  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  const put = (col: string, value: unknown, cast = '') => {
    sets.push(`${col} = $${i}${cast}`);
    params.push(value);
    i += 1;
  };

  if (typeof input.is_private === 'boolean') put('is_private', input.is_private);
  if (input.allow_comments === 'public' || input.allow_comments === 'followers' || input.allow_comments === 'private') {
    put('allow_comments', input.allow_comments);
  }
  if (typeof input.show_activity_status === 'boolean') put('show_activity_status', input.show_activity_status);
  if (input.theme_mode === 'system' || input.theme_mode === 'light' || input.theme_mode === 'dark') {
    put('theme_mode', input.theme_mode);
  }
  if (input.theme_accent_color !== undefined) {
    const v = input.theme_accent_color;
    put('theme_accent_color', v === null ? null : typeof v === 'string' ? v.trim() || null : null);
  }
  if (input.display_name !== undefined) {
    put('display_name', input.display_name === null ? null : typeof input.display_name === 'string' ? input.display_name : null);
  }
  if (input.bio !== undefined) {
    put('bio', input.bio === null ? null : typeof input.bio === 'string' ? input.bio : null);
  }
  if (input.avatar_url !== undefined) {
    const v = input.avatar_url;
    put('avatar_url', v === null ? null : typeof v === 'string' ? v.trim() || null : null);
  }

  if (sets.length === 0) return;
  sets.push('updated_at = NOW()');
  params.push(memberId);

  await query(
    `UPDATE user_profiles
     SET ${sets.join(', ')}
     WHERE member_id = $${params.length}`,
    params,
  );
}

export async function likePost(postId: string, memberId: number): Promise<{ like_count: number; inserted: boolean }> {
  const ins = await query(
    `INSERT INTO profile_post_likes (post_id, member_id)
     VALUES ($1::bigint, $2)
     ON CONFLICT (post_id, member_id) DO NOTHING`,
    [postId, memberId],
  );
  const cnt = await query(`SELECT COUNT(*)::int AS c FROM profile_post_likes WHERE post_id = $1::bigint`, [postId]);
  return { like_count: Number((cnt.rows[0] as { c?: unknown } | undefined)?.c ?? 0), inserted: (ins.rowCount ?? 0) > 0 };
}

export async function unlikePost(postId: string, memberId: number): Promise<{ like_count: number; removed: boolean }> {
  const del = await query(`DELETE FROM profile_post_likes WHERE post_id = $1::bigint AND member_id = $2`, [postId, memberId]);
  const cnt = await query(`SELECT COUNT(*)::int AS c FROM profile_post_likes WHERE post_id = $1::bigint`, [postId]);
  return { like_count: Number((cnt.rows[0] as { c?: unknown } | undefined)?.c ?? 0), removed: (del.rowCount ?? 0) > 0 };
}

export async function addComment(
  postId: string,
  memberId: number,
  text: string,
): Promise<{ id: string; created_at: string }> {
  const r = await query(
    `INSERT INTO profile_post_comments (post_id, member_id, text)
     VALUES ($1::bigint, $2, $3)
     RETURNING id::text AS id, created_at::text AS created_at`,
    [postId, memberId, text],
  );
  const row = r.rows[0] as { id?: string; created_at?: string } | undefined;
  if (!row?.id) throw new Error('Failed to add comment');
  return { id: row.id, created_at: String(row.created_at ?? new Date().toISOString()) };
}
