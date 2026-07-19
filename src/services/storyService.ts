import { query } from '../config/db';
import type { MediaType, ProfilePostAuthor } from './profileService';

const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const CAPTION_MAX = 500;

export type StoryItem = {
  id: string;
  member_id: number;
  media_url: string;
  media_type: MediaType;
  caption: string | null;
  created_at: string;
  expires_at: string;
  viewed_by_me: boolean;
};

export type StoryAuthorGroup = {
  author: ProfilePostAuthor;
  stories: StoryItem[];
  /** Все сторис автора просмотрены текущим пользователем (кроме своих). */
  all_seen: boolean;
  is_me: boolean;
};

async function ensureProfileRow(memberId: number): Promise<void> {
  await query(
    `INSERT INTO user_profiles (member_id, username)
     VALUES ($1, $2)
     ON CONFLICT (member_id) DO NOTHING`,
    [memberId, `member-${memberId}`],
  );
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

export async function listActiveStories(viewerMemberId: number): Promise<StoryAuthorGroup[]> {
  await ensureProfileRow(viewerMemberId);

  const storiesRes = await query(
    `SELECT
      s.id::text AS id,
      s.member_id,
      s.media_url,
      s.media_type::text AS media_type,
      s.caption,
      s.created_at::text AS created_at,
      s.expires_at::text AS expires_at,
      EXISTS (
        SELECT 1 FROM profile_story_views v
        WHERE v.story_id = s.id AND v.viewer_member_id = $1
      ) AS viewed_by_me
     FROM profile_stories s
     INNER JOIN user_profiles up ON up.member_id = s.member_id
     WHERE s.expires_at > NOW()
       AND (up.is_private = FALSE OR s.member_id = $1)
     ORDER BY s.created_at ASC, s.id ASC`,
    [viewerMemberId],
  );

  const rows = storiesRes.rows as Array<{
    id: string;
    member_id: number;
    media_url: string;
    media_type: string;
    caption: string | null;
    created_at: string;
    expires_at: string;
    viewed_by_me: boolean;
  }>;

  if (rows.length === 0) {
    const meAuthors = await loadAuthorsForMemberIds([viewerMemberId]);
    const me = meAuthors.get(viewerMemberId);
    if (!me) return [];
    return [
      {
        author: me,
        stories: [],
        all_seen: true,
        is_me: true,
      },
    ];
  }

  const authors = await loadAuthorsForMemberIds([
    ...rows.map((r) => r.member_id),
    viewerMemberId,
  ]);

  const byMember = new Map<number, StoryItem[]>();
  for (const row of rows) {
    const list = byMember.get(row.member_id) ?? [];
    list.push({
      id: row.id,
      member_id: row.member_id,
      media_url: row.media_url,
      media_type: row.media_type === 'video' ? 'video' : 'image',
      caption: row.caption,
      created_at: row.created_at,
      expires_at: row.expires_at,
      viewed_by_me: Boolean(row.viewed_by_me),
    });
    byMember.set(row.member_id, list);
  }

  const groups: StoryAuthorGroup[] = [];
  for (const [memberId, stories] of byMember) {
    const author = authors.get(memberId);
    if (!author) continue;
    const isMe = memberId === viewerMemberId;
    const all_seen = isMe ? true : stories.every((s) => s.viewed_by_me);
    groups.push({ author, stories, all_seen, is_me: isMe });
  }

  // Свои кольцо всегда первым; непросмотренные — выше просмотренных; внутри — по свежести последней сторис.
  groups.sort((a, b) => {
    if (a.is_me !== b.is_me) return a.is_me ? -1 : 1;
    if (a.all_seen !== b.all_seen) return a.all_seen ? 1 : -1;
    const aLast = a.stories[a.stories.length - 1]?.created_at ?? '';
    const bLast = b.stories[b.stories.length - 1]?.created_at ?? '';
    return bLast.localeCompare(aLast);
  });

  if (!groups.some((g) => g.is_me)) {
    const me = authors.get(viewerMemberId);
    if (me) {
      groups.unshift({ author: me, stories: [], all_seen: true, is_me: true });
    }
  }

  return groups;
}

export async function createStory(input: {
  memberId: number;
  mediaUrl: string;
  mediaType: MediaType;
  caption?: string | null;
}): Promise<{ id: string; expires_at: string }> {
  await ensureProfileRow(input.memberId);
  const url = input.mediaUrl.trim();
  if (!url) throw new Error('Нужен медиафайл');
  let caption: string | null = null;
  if (typeof input.caption === 'string') {
    const t = input.caption.trim();
    if (t.length > CAPTION_MAX) throw new Error(`Подпись слишком длинная (макс. ${CAPTION_MAX})`);
    caption = t.length > 0 ? t : null;
  }
  const expiresAt = new Date(Date.now() + STORY_TTL_MS).toISOString();
  const r = await query(
    `INSERT INTO profile_stories (member_id, media_url, media_type, caption, expires_at)
     VALUES ($1, $2, $3::profile_media_type, $4, $5::timestamptz)
     RETURNING id::text AS id, expires_at::text AS expires_at`,
    [input.memberId, url, input.mediaType, caption, expiresAt],
  );
  const row = r.rows[0] as { id?: string; expires_at?: string } | undefined;
  if (!row?.id) throw new Error('Failed to create story');
  return { id: row.id, expires_at: String(row.expires_at ?? expiresAt) };
}

export async function markStoryViewed(storyId: string, viewerMemberId: number): Promise<boolean> {
  const exists = await query(
    `SELECT 1 FROM profile_stories WHERE id = $1::bigint AND expires_at > NOW()`,
    [storyId],
  );
  if (exists.rows.length === 0) return false;
  await query(
    `INSERT INTO profile_story_views (story_id, viewer_member_id)
     VALUES ($1::bigint, $2)
     ON CONFLICT (story_id, viewer_member_id) DO NOTHING`,
    [storyId, viewerMemberId],
  );
  return true;
}

export async function deleteStoryAsOwner(storyId: string, memberId: number): Promise<boolean> {
  const r = await query(
    `DELETE FROM profile_stories WHERE id = $1::bigint AND member_id = $2`,
    [storyId, memberId],
  );
  return (r.rowCount ?? 0) > 0;
}
