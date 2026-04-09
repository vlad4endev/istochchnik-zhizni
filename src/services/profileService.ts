import { query } from '../config/db';

export type PrivacyLevel = 'public' | 'followers' | 'private';
export type ThemeMode = 'system' | 'light' | 'dark';
export type MediaType = 'image' | 'video';

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
  }>;
};

async function ensureProfileRow(memberId: number): Promise<void> {
  // Minimal default profile row (username fallback = member-<id>).
  await query(
    `INSERT INTO user_profiles (member_id, username)
     VALUES ($1, $2)
     ON CONFLICT (member_id) DO NOTHING`,
    [memberId, `member-${memberId}`],
  );
}

export async function getProfileWithFeed(memberId: number): Promise<ProfileView | null> {
  await ensureProfileRow(memberId);
  const prof = await query(
    `SELECT
      member_id,
      username,
      display_name,
      bio,
      avatar_url,
      is_private,
      allow_comments,
      show_activity_status,
      theme_mode,
      theme_accent_color,
      created_at::text AS created_at,
      updated_at::text AS updated_at
     FROM user_profiles
     WHERE member_id = $1`,
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
      COALESCE(l.like_count, 0)::int AS like_count,
      COALESCE(c.comment_count, 0)::int AS comment_count
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
     WHERE p.member_id = $1
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT 30`,
    [memberId],
  );

  const postIds = postsRes.rows.map((r) => String((r as { id: unknown }).id));
  const mediaByPost = new Map<string, Array<{ url: string; type: MediaType; order: number }>>();
  if (postIds.length > 0) {
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
  }

  const posts = postsRes.rows.map((r) => {
    const row = r as {
      id: string;
      member_id: number;
      caption: string | null;
      created_at: string;
      like_count: number;
      comment_count: number;
    };
    return {
      ...row,
      media: mediaByPost.get(row.id) ?? [],
    };
  });

  return { profile, posts };
}

const USERNAME_MAX_LEN = 64;

/** Resolve `user_profiles.username` (case-insensitive) → same payload as `getProfileWithFeed`. */
export async function getProfileWithFeedByUsername(username: string): Promise<ProfileView | null> {
  const u = username.trim();
  if (!u || u.length > USERNAME_MAX_LEN) return null;
  const found = await query(
    `SELECT member_id FROM user_profiles WHERE LOWER(username) = LOWER($1) LIMIT 1`,
    [u],
  );
  const mid = (found.rows[0] as { member_id?: unknown } | undefined)?.member_id;
  const memberId = typeof mid === 'number' ? mid : typeof mid === 'string' ? Number(mid) : NaN;
  if (!Number.isInteger(memberId) || memberId <= 0) return null;
  return getProfileWithFeed(memberId);
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
    };

export async function createPost(input: CreatePostInput): Promise<{ id: string }> {
  const media = input.kind === 'urls' ? input.media : input.uploads;
  if (!Array.isArray(media) || media.length === 0) {
    throw new Error('At least one media item is required');
  }

  const created = await query(
    `INSERT INTO profile_posts (member_id, caption)
     VALUES ($1, $2)
     RETURNING id::text AS id`,
    [input.memberId, input.caption],
  );
  const postId = (created.rows[0] as { id?: string } | undefined)?.id;
  if (!postId) {
    throw new Error('Failed to create post');
  }

  // Normalize ordering: stable by provided order, then array order
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

