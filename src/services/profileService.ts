import { query } from '../config/db';
import {
  decodeFeedListCursor,
  encodeRecentCursor,
  encodeSmartCursor,
  feedDayKey,
  rankFeedPosts,
  type RankableFeedPost,
  type SmartFeedCursorV1,
  viewerDaySeed,
} from './feedRanking';

export type PrivacyLevel = 'public' | 'followers' | 'private';
export type ThemeMode = 'system' | 'light' | 'dark';
export type MediaType = 'image' | 'video';

export type ProfilePostAuthor = {
  member_id: number;
  username: string;
  first_name: string | null;
  last_name: string | null;
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
    first_name: string | null;
    last_name: string | null;
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
      m.first_name,
      m.last_name,
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
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
    avatar_url: string | null;
  }>) {
    map.set(row.member_id, {
      member_id: row.member_id,
      username: row.username,
      first_name: row.first_name,
      last_name: row.last_name,
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
      m.first_name,
      m.last_name,
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

export type FeedPost = {
  id: string;
  member_id: number;
  author: ProfilePostAuthor;
  caption: string | null;
  created_at: string;
  media: Array<{ url: string; type: MediaType; order: number }>;
  like_count: number;
  comment_count: number;
  repost_count: number;
  liked_by_me: boolean;
  reposted_by_me: boolean;
  shared_post: ProfilePostEmbedded | null;
};

export type ChurchFeedPage = {
  posts: FeedPost[];
  next_cursor: string | null;
  /** Режим выдачи: умный ранжировщик или чистая хронология. */
  sort: 'smart' | 'recent';
};

type FeedSqlRow = {
  id: string;
  member_id: number;
  caption: string | null;
  created_at: string;
  shared_post_id: string | null;
  like_count: number;
  comment_count: number;
  repost_count: number;
  media_count: number;
  has_video: boolean;
  caption_len: number;
  author_likes_from_me: number;
  author_comments_from_me: number;
  likes_6h: number;
  comments_6h: number;
  author_post_count_7d: number;
  is_admin: boolean;
};

const FEED_SELECT_CORE = `
  p.id::text AS id,
  p.member_id,
  p.caption,
  p.created_at::text AS created_at,
  p.shared_post_id::text AS shared_post_id,
  COALESCE(l.like_count, 0)::int AS like_count,
  COALESCE(c.comment_count, 0)::int AS comment_count,
  COALESCE(rc.cnt, 0)::int AS repost_count,
  COALESCE(med.media_count, 0)::int AS media_count,
  COALESCE(med.has_video, FALSE) AS has_video,
  COALESCE(LENGTH(p.caption), 0)::int AS caption_len,
  COALESCE(al.cnt, 0)::int AS author_likes_from_me,
  COALESCE(ac.cnt, 0)::int AS author_comments_from_me,
  COALESCE(lv.cnt, 0)::int AS likes_6h,
  COALESCE(cv.cnt, 0)::int AS comments_6h,
  COALESCE(ap.cnt, 0)::int AS author_post_count_7d,
  (
    LOWER(COALESCE(m.app_role, '')) = 'admin'
    OR EXISTS (
      SELECT 1
      FROM unnest(COALESCE(m.app_roles, ARRAY[]::text[])) AS r(role)
      WHERE LOWER(r.role) = 'admin'
    )
  ) AS is_admin
`;

const FEED_JOINS = `
  INNER JOIN user_profiles up ON up.member_id = p.member_id
  INNER JOIN members m ON m.id = p.member_id
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
  LEFT JOIN (
    SELECT
      post_id,
      COUNT(*)::int AS media_count,
      BOOL_OR(type = 'video') AS has_video
    FROM profile_post_media
    GROUP BY post_id
  ) med ON med.post_id = p.id
  LEFT JOIN (
    SELECT p2.member_id AS author_id, COUNT(*)::int AS cnt
    FROM profile_post_likes lk
    INNER JOIN profile_posts p2 ON p2.id = lk.post_id
    WHERE lk.member_id = $1
    GROUP BY p2.member_id
  ) al ON al.author_id = p.member_id
  LEFT JOIN (
    SELECT p2.member_id AS author_id, COUNT(*)::int AS cnt
    FROM profile_post_comments cm
    INNER JOIN profile_posts p2 ON p2.id = cm.post_id
    WHERE cm.member_id = $1
    GROUP BY p2.member_id
  ) ac ON ac.author_id = p.member_id
  LEFT JOIN (
    SELECT post_id, COUNT(*)::int AS cnt
    FROM profile_post_likes
    WHERE created_at > NOW() - INTERVAL '6 hours'
    GROUP BY post_id
  ) lv ON lv.post_id = p.id
  LEFT JOIN (
    SELECT post_id, COUNT(*)::int AS cnt
    FROM profile_post_comments
    WHERE created_at > NOW() - INTERVAL '6 hours'
    GROUP BY post_id
  ) cv ON cv.post_id = p.id
  LEFT JOIN (
    SELECT member_id, COUNT(*)::int AS cnt
    FROM profile_posts
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY member_id
  ) ap ON ap.member_id = p.member_id
`;

async function hydrateFeedPosts(
  pageRows: FeedSqlRow[],
  viewerId: number,
): Promise<FeedPost[]> {
  const postIds = pageRows.map((r) => r.id);
  const sharedIds = pageRows.map((r) => r.shared_post_id).filter((x): x is string => !!x);
  const memberIds = pageRows.map((r) => r.member_id);

  const [mediaByPost, authors, embeddedById] = await Promise.all([
    loadMediaMap(postIds),
    loadAuthorsForMemberIds(memberIds),
    sharedIds.length > 0
      ? buildEmbeddedPosts([...new Set(sharedIds)])
      : Promise.resolve(new Map<string, ProfilePostEmbedded>()),
  ]);

  let likedSet = new Set<string>();
  let repostedRootSet = new Set<string>();
  if (viewerId > 0 && postIds.length > 0) {
    const lk = await query(
      `SELECT post_id::text AS post_id FROM profile_post_likes
       WHERE member_id = $1 AND post_id = ANY($2::bigint[])`,
      [viewerId, postIds.map((id) => BigInt(id))],
    );
    likedSet = new Set((lk.rows as Array<{ post_id: string }>).map((x) => x.post_id));

    const rootIds = [
      ...new Set(
        pageRows.map((r) => (r.shared_post_id && r.shared_post_id.length > 0 ? r.shared_post_id : r.id)),
      ),
    ];
    if (rootIds.length > 0) {
      const rp = await query(
        `SELECT shared_post_id::text AS sid
         FROM profile_posts
         WHERE member_id = $1 AND shared_post_id = ANY($2::bigint[])`,
        [viewerId, rootIds.map((id) => BigInt(id))],
      );
      repostedRootSet = new Set((rp.rows as Array<{ sid: string }>).map((x) => x.sid));
    }
  }

  const posts: FeedPost[] = [];
  for (const row of pageRows) {
    const author = authors.get(row.member_id);
    if (!author) continue;
    const contentRootId =
      row.shared_post_id && row.shared_post_id.length > 0 ? row.shared_post_id : row.id;
    posts.push({
      id: row.id,
      member_id: row.member_id,
      author,
      caption: row.caption,
      created_at: row.created_at,
      media: mediaByPost.get(row.id) ?? [],
      like_count: row.like_count,
      comment_count: row.comment_count,
      repost_count: row.repost_count,
      liked_by_me: likedSet.has(row.id),
      reposted_by_me: repostedRootSet.has(contentRootId),
      shared_post: row.shared_post_id ? embeddedById.get(row.shared_post_id) ?? null : null,
    });
  }
  return posts;
}

async function getChurchFeedRecent(params: {
  viewerMemberId: number;
  cursorT?: string;
  cursorId?: string;
  limit: number;
}): Promise<ChurchFeedPage> {
  const viewerId = params.viewerMemberId;
  const limit = params.limit;
  const sqlParams: unknown[] = [viewerId];
  let cursorClause = '';
  if (params.cursorT && params.cursorId) {
    sqlParams.push(params.cursorT, params.cursorId);
    cursorClause = `AND (p.created_at, p.id) < ($2::timestamptz, $3::bigint)`;
  }
  sqlParams.push(limit + 1);
  const limitParam = `$${sqlParams.length}`;

  const postsRes = await query(
    `SELECT ${FEED_SELECT_CORE}
     FROM profile_posts p
     ${FEED_JOINS}
     WHERE (up.is_private = FALSE OR p.member_id = $1)
     ${cursorClause}
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT ${limitParam}`,
    sqlParams,
  );

  const postRows = postsRes.rows as FeedSqlRow[];
  const hasMore = postRows.length > limit;
  const pageRows = hasMore ? postRows.slice(0, limit) : postRows;
  const posts = await hydrateFeedPosts(pageRows, viewerId);
  const last = pageRows[pageRows.length - 1];
  return {
    posts,
    next_cursor: hasMore && last ? encodeRecentCursor(last.created_at, last.id) : null,
    sort: 'recent',
  };
}

async function getChurchFeedSmart(params: {
  viewerMemberId: number;
  cursor: SmartFeedCursorV1 | null;
  limit: number;
}): Promise<ChurchFeedPage> {
  const viewerId = params.viewerMemberId;
  const limit = params.limit;
  const day = params.cursor?.day && params.cursor.day === feedDayKey()
    ? params.cursor.day
    : feedDayKey();
  const seed =
    params.cursor?.day === day && params.cursor.seed
      ? params.cursor.seed
      : viewerDaySeed(viewerId, day);

  // Chrono-хвост: посты старше окна ранжирования.
  if (params.cursor?.phase === 'chrono' && params.cursor.t && params.cursor.id) {
    const chrono = await getChurchFeedRecent({
      viewerMemberId: viewerId,
      cursorT: params.cursor.t,
      cursorId: params.cursor.id,
      limit,
    });
    // Сохраняем smart-cursor обёртку, чтобы клиент оставался в smart-режиме.
    if (!chrono.next_cursor) {
      return { posts: chrono.posts, next_cursor: null, sort: 'smart' };
    }
    const decoded = decodeFeedListCursor(chrono.next_cursor);
    if (decoded && 't' in decoded && decoded.t && decoded.id) {
      return {
        posts: chrono.posts,
        next_cursor: encodeSmartCursor({
          v: 1,
          mode: 'smart',
          phase: 'chrono',
          off: 0,
          day,
          seed,
          t: decoded.t,
          id: decoded.id,
        }),
        sort: 'smart',
      };
    }
    return { posts: chrono.posts, next_cursor: null, sort: 'smart' };
  }

  const offset = params.cursor?.phase === 'ranked' ? Math.max(0, params.cursor.off) : 0;

  // Кандидаты: до 400 постов за 75 дней — достаточно для церковного масштаба.
  const poolRes = await query(
    `SELECT ${FEED_SELECT_CORE}
     FROM profile_posts p
     ${FEED_JOINS}
     WHERE (up.is_private = FALSE OR p.member_id = $1)
       AND p.created_at > NOW() - INTERVAL '75 days'
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT 400`,
    [viewerId],
  );

  const poolRows = poolRes.rows as FeedSqlRow[];
  const rankable: Array<FeedSqlRow & RankableFeedPost> = poolRows.map((r) => ({
    ...r,
    media_count: Number(r.media_count ?? 0),
    has_video: Boolean(r.has_video),
    caption_len: Number(r.caption_len ?? 0),
    is_repost: Boolean(r.shared_post_id),
    is_own: r.member_id === viewerId,
    is_admin: Boolean(r.is_admin),
    author_likes_from_me: Number(r.author_likes_from_me ?? 0),
    author_comments_from_me: Number(r.author_comments_from_me ?? 0),
    likes_6h: Number(r.likes_6h ?? 0),
    comments_6h: Number(r.comments_6h ?? 0),
    author_post_count_7d: Number(r.author_post_count_7d ?? 0),
    like_count: Number(r.like_count ?? 0),
    comment_count: Number(r.comment_count ?? 0),
    repost_count: Number(r.repost_count ?? 0),
  }));

  const ranked = rankFeedPosts(rankable, { seedHex: seed });

  // Если offset уже за пределами пула — сразу уходим в chrono-хвост.
  if (offset < ranked.length) {
    const pageSlice = ranked.slice(offset, offset + limit);
    const posts = await hydrateFeedPosts(pageSlice, viewerId);
    const nextOff = offset + pageSlice.length;
    if (nextOff < ranked.length) {
      return {
        posts,
        next_cursor: encodeSmartCursor({
          v: 1,
          mode: 'smart',
          phase: 'ranked',
          off: nextOff,
          day,
          seed,
        }),
        sort: 'smart',
      };
    }

    const oldest = poolRows[poolRows.length - 1];
    if (oldest) {
      return {
        posts,
        next_cursor: encodeSmartCursor({
          v: 1,
          mode: 'smart',
          phase: 'chrono',
          off: 0,
          day,
          seed,
          t: oldest.created_at,
          id: oldest.id,
        }),
        sort: 'smart',
      };
    }
    return { posts, next_cursor: null, sort: 'smart' };
  }

  const oldest = poolRows[poolRows.length - 1];
  if (!oldest) {
    return { posts: [], next_cursor: null, sort: 'smart' };
  }
  return getChurchFeedSmart({
    viewerMemberId: viewerId,
    cursor: {
      v: 1,
      mode: 'smart',
      phase: 'chrono',
      off: 0,
      day,
      seed,
      t: oldest.created_at,
      id: oldest.id,
    },
    limit,
  });
}

/** Церковная лента: smart (по умолчанию) или recent (хронология). */
export async function getChurchFeed(params: {
  viewerMemberId: number;
  cursor?: string | null;
  limit?: number;
  sort?: 'smart' | 'recent' | string | null;
}): Promise<ChurchFeedPage> {
  const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 50);
  const viewerId = params.viewerMemberId;
  const decoded = decodeFeedListCursor(params.cursor);

  const sortRaw = (params.sort ?? '').toString().trim().toLowerCase();
  let sort: 'smart' | 'recent' =
    sortRaw === 'recent' || sortRaw === 'chrono' || sortRaw === 'latest' ? 'recent' : 'smart';

  // Legacy cursor без mode → recent; smart-cursor сохраняет режим.
  if (decoded && 'mode' in decoded && decoded.mode === 'recent') sort = 'recent';
  if (decoded && 'mode' in decoded && decoded.mode === 'smart') sort = 'smart';
  if (decoded && !('mode' in decoded) && 't' in decoded) sort = 'recent';

  if (sort === 'recent') {
    const t =
      decoded && 't' in decoded && typeof decoded.t === 'string' ? decoded.t : undefined;
    const id =
      decoded && 'id' in decoded && typeof decoded.id === 'string' ? decoded.id : undefined;
    return getChurchFeedRecent({
      viewerMemberId: viewerId,
      cursorT: t,
      cursorId: id,
      limit,
    });
  }

  const smartCursor =
    decoded && 'mode' in decoded && decoded.mode === 'smart'
      ? (decoded as SmartFeedCursorV1)
      : null;

  return getChurchFeedSmart({
    viewerMemberId: viewerId,
    cursor: smartCursor,
    limit,
  });
}

/**
 * Число новых постов в ленте после watermark пользователя.
 * При первом опросе создаём watermark = NOW(), чтобы не засыпать бейджем старыми постами.
 * Свои посты не учитываем.
 */
export async function getFeedUnreadCount(viewerMemberId: number): Promise<number> {
  const viewerId = Number(viewerMemberId);
  if (!Number.isInteger(viewerId) || viewerId <= 0) return 0;

  await query(
    `INSERT INTO member_feed_watermarks (member_id, last_seen_at, updated_at)
     VALUES ($1, NOW(), NOW())
     ON CONFLICT (member_id) DO NOTHING`,
    [viewerId],
  );

  const result = await query(
    `SELECT COUNT(*)::int AS n
     FROM profile_posts p
     INNER JOIN user_profiles up ON up.member_id = p.member_id
     WHERE (up.is_private = FALSE OR p.member_id = $1)
       AND p.member_id <> $1
       AND p.created_at > (
         SELECT w.last_seen_at FROM member_feed_watermarks w WHERE w.member_id = $1
       )`,
    [viewerId],
  );
  return Math.max(0, Number(result.rows[0]?.n ?? 0));
}

/** Продвигает watermark «лента просмотрена» до seenAt (или NOW()). */
export async function markFeedSeen(
  viewerMemberId: number,
  seenAt?: string | Date | null,
): Promise<{ last_seen_at: string }> {
  const viewerId = Number(viewerMemberId);
  if (!Number.isInteger(viewerId) || viewerId <= 0) {
    throw new Error('Invalid member id');
  }

  let seen: Date | null = null;
  if (seenAt instanceof Date && !Number.isNaN(seenAt.getTime())) {
    seen = seenAt;
  } else if (typeof seenAt === 'string' && seenAt.trim()) {
    const parsed = new Date(seenAt);
    if (!Number.isNaN(parsed.getTime())) seen = parsed;
  }

  const result = await query(
    `INSERT INTO member_feed_watermarks (member_id, last_seen_at, updated_at)
     VALUES ($1, COALESCE($2::timestamptz, NOW()), NOW())
     ON CONFLICT (member_id) DO UPDATE
       SET last_seen_at = GREATEST(
             member_feed_watermarks.last_seen_at,
             COALESCE($2::timestamptz, NOW())
           ),
           updated_at = NOW()
     RETURNING last_seen_at::text AS last_seen_at`,
    [viewerId, seen ? seen.toISOString() : null],
  );
  const lastSeen = String(result.rows[0]?.last_seen_at ?? new Date().toISOString());
  return { last_seen_at: lastSeen };
}

export type ProfilePostComment = {
  id: string;
  post_id: string;
  member_id: number | null;
  text: string;
  created_at: string;
  author: ProfilePostAuthor | null;
  like_count: number;
  liked_by_me: boolean;
};

let commentLikesSchemaReady: Promise<void> | null = null;

async function ensureCommentLikesSchema(): Promise<void> {
  if (!commentLikesSchemaReady) {
    commentLikesSchemaReady = (async () => {
      await query(`
CREATE TABLE IF NOT EXISTS profile_post_comment_likes (
  comment_id BIGINT NOT NULL REFERENCES profile_post_comments(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, member_id)
)`);
      await query(
        `CREATE INDEX IF NOT EXISTS idx_profile_post_comment_likes_comment
         ON profile_post_comment_likes (comment_id)`,
      );
    })().catch((err) => {
      commentLikesSchemaReady = null;
      throw err;
    });
  }
  await commentLikesSchemaReady;
}

async function getPostCommentGate(postId: string): Promise<{
  postMemberId: number;
  allowComments: PrivacyLevel;
} | null> {
  const r = await query(
    `SELECT
       p.member_id,
       COALESCE(up.allow_comments, 'public') AS allow_comments
     FROM profile_posts p
     LEFT JOIN user_profiles up ON up.member_id = p.member_id
     WHERE p.id = $1::bigint`,
    [postId],
  );
  const row = r.rows[0] as { member_id?: number; allow_comments?: string } | undefined;
  if (!row || row.member_id == null) return null;
  const allow =
    row.allow_comments === 'private' || row.allow_comments === 'followers' || row.allow_comments === 'public'
      ? (row.allow_comments as PrivacyLevel)
      : 'public';
  return { postMemberId: row.member_id, allowComments: allow };
}

/** Может ли viewer комментировать / читать комментарии. `followers` = как public (нет follow-графа). */
export function canAccessPostComments(
  gate: { postMemberId: number; allowComments: PrivacyLevel },
  viewerMemberId: number,
): boolean {
  if (gate.allowComments === 'private') {
    return viewerMemberId === gate.postMemberId;
  }
  return true;
}

export async function listComments(postId: string, viewerMemberId: number): Promise<ProfilePostComment[]> {
  await ensureCommentLikesSchema();
  const gate = await getPostCommentGate(postId);
  if (!gate) throw new Error('Публикация не найдена');
  if (!canAccessPostComments(gate, viewerMemberId)) {
    throw new Error('Комментарии недоступны');
  }

  const r = await query(
    `SELECT
      c.id::text AS id,
      c.post_id::text AS post_id,
      c.member_id,
      c.text,
      c.created_at::text AS created_at,
      COALESCE(lc.cnt, 0)::int AS like_count,
      EXISTS (
        SELECT 1 FROM profile_post_comment_likes cl
        WHERE cl.comment_id = c.id AND cl.member_id = $2
      ) AS liked_by_me
     FROM profile_post_comments c
     LEFT JOIN (
       SELECT comment_id, COUNT(*)::int AS cnt
       FROM profile_post_comment_likes
       GROUP BY comment_id
     ) lc ON lc.comment_id = c.id
     WHERE c.post_id = $1::bigint
     ORDER BY c.created_at ASC, c.id ASC
     LIMIT 200`,
    [postId, viewerMemberId],
  );
  const rows = r.rows as Array<{
    id: string;
    post_id: string;
    member_id: number | null;
    text: string;
    created_at: string;
    like_count: number;
    liked_by_me: boolean;
  }>;
  const authors = await loadAuthorsForMemberIds(
    rows.map((x) => x.member_id).filter((id): id is number => typeof id === 'number' && id > 0),
  );
  return rows.map((row) => ({
    id: row.id,
    post_id: row.post_id,
    member_id: row.member_id,
    text: row.text,
    created_at: row.created_at,
    author: row.member_id != null ? authors.get(row.member_id) ?? null : null,
    like_count: Number(row.like_count ?? 0),
    liked_by_me: Boolean(row.liked_by_me),
  }));
}

export async function likeComment(
  postId: string,
  commentId: string,
  memberId: number,
): Promise<{ like_count: number }> {
  await ensureCommentLikesSchema();
  const gate = await getPostCommentGate(postId);
  if (!gate) throw new Error('Публикация не найдена');
  if (!canAccessPostComments(gate, memberId)) {
    throw new Error('Комментарии недоступны');
  }
  const owns = await query(
    `SELECT 1 FROM profile_post_comments WHERE id = $1::bigint AND post_id = $2::bigint`,
    [commentId, postId],
  );
  if (owns.rows.length === 0) throw new Error('Комментарий не найден');
  await query(
    `INSERT INTO profile_post_comment_likes (comment_id, member_id)
     VALUES ($1::bigint, $2)
     ON CONFLICT DO NOTHING`,
    [commentId, memberId],
  );
  const cnt = await query(
    `SELECT COUNT(*)::int AS c FROM profile_post_comment_likes WHERE comment_id = $1::bigint`,
    [commentId],
  );
  return { like_count: Number((cnt.rows[0] as { c?: number })?.c ?? 0) };
}

export async function unlikeComment(
  postId: string,
  commentId: string,
  memberId: number,
): Promise<{ like_count: number }> {
  await ensureCommentLikesSchema();
  const gate = await getPostCommentGate(postId);
  if (!gate) throw new Error('Публикация не найдена');
  if (!canAccessPostComments(gate, memberId)) {
    throw new Error('Комментарии недоступны');
  }
  await query(
    `DELETE FROM profile_post_comment_likes
     WHERE comment_id = $1::bigint AND member_id = $2`,
    [commentId, memberId],
  );
  const cnt = await query(
    `SELECT COUNT(*)::int AS c FROM profile_post_comment_likes WHERE comment_id = $1::bigint`,
    [commentId],
  );
  return { like_count: Number((cnt.rows[0] as { c?: number })?.c ?? 0) };
}

export async function addComment(
  postId: string,
  memberId: number,
  text: string,
): Promise<{ id: string; created_at: string }> {
  const gate = await getPostCommentGate(postId);
  if (!gate) throw new Error('Публикация не найдена');
  if (!canAccessPostComments(gate, memberId)) {
    throw new Error('Комментарии недоступны');
  }
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

export async function deleteCommentAsOwnerOrAdmin(
  postId: string,
  commentId: string,
  memberId: number,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) {
    const r = await query(
      `DELETE FROM profile_post_comments
       WHERE id = $1::bigint AND post_id = $2::bigint`,
      [commentId, postId],
    );
    return (r.rowCount ?? 0) > 0;
  }
  const r = await query(
    `DELETE FROM profile_post_comments
     WHERE id = $1::bigint AND post_id = $2::bigint AND member_id = $3`,
    [commentId, postId, memberId],
  );
  return (r.rowCount ?? 0) > 0;
}

/** Удалить свою публикацию (каскадно снимаются лайки, комментарии, медиа). */
export async function deletePostAsOwner(postId: string, memberId: number): Promise<boolean> {
  const r = await query(`DELETE FROM profile_posts WHERE id = $1::bigint AND member_id = $2`, [postId, memberId]);
  return (r.rowCount ?? 0) > 0;
}

/** Изменить подпись к своей публикации (в т.ч. комментарий к репосту). */
export async function updatePostCaptionAsOwner(
  postId: string,
  memberId: number,
  captionRaw: unknown,
): Promise<void> {
  const meta = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM profile_post_media m WHERE m.post_id = p.id) AS media_count
     FROM profile_posts p
     WHERE p.id = $1::bigint AND p.member_id = $2`,
    [postId, memberId],
  );
  if (meta.rows.length === 0) {
    throw new Error('Публикация не найдена или нет доступа');
  }
  const mediaCount = Number((meta.rows[0] as { media_count?: number }).media_count ?? 0);
  const cap = typeof captionRaw === 'string' ? normalizeCaption(captionRaw) : null;
  if (mediaCount === 0 && !cap) {
    throw new Error('Для публикации без фото или видео нужен текст');
  }
  if (cap !== null && cap.length > CAPTION_MAX_LEN) {
    throw new Error(`Текст слишком длинный (макс. ${CAPTION_MAX_LEN} символов)`);
  }
  await query(`UPDATE profile_posts SET caption = $1 WHERE id = $2::bigint AND member_id = $3`, [
    cap,
    postId,
    memberId,
  ]);
}
