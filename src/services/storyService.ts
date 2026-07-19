import { query } from '../config/db';
import { rankStoryGroups } from './feedRanking';
import {
  findOrCreatePersonalConversation,
  sendMessage,
} from './messengerService';
import type { MessageWithSender } from '../types/messenger';
import type { MediaType, ProfilePostAuthor } from './profileService';

const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const CAPTION_MAX = 500;
const REPLY_TEXT_MAX = 1000;
const REACTION_MAX = 16;

async function ensureStoryReplyPayloadType(): Promise<void> {
  await query(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'message_payload_type'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'message_payload_type'
      AND e.enumlabel = 'story_reply'
  ) THEN
    ALTER TYPE public.message_payload_type ADD VALUE 'story_reply';
  END IF;
END $$`);
}

let storiesSchemaReady: Promise<void> | null = null;

/** Создаёт таблицы сторис на лету, если миграция не применилась (например из‑за индекса с NOW()). */
export async function ensureStoriesSchema(): Promise<void> {
  if (!storiesSchemaReady) {
    storiesSchemaReady = (async () => {
      await query(`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_media_type') THEN
    CREATE TYPE profile_media_type AS ENUM ('image', 'video');
  END IF;
END $$`);
      await query(`
CREATE TABLE IF NOT EXISTS profile_stories (
  id BIGSERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type profile_media_type NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
)`);
      await query(`DROP INDEX IF EXISTS idx_profile_stories_active`);
      await query(
        `CREATE INDEX IF NOT EXISTS idx_profile_stories_expires
         ON profile_stories (expires_at DESC, created_at DESC)`,
      );
      await query(
        `CREATE INDEX IF NOT EXISTS idx_profile_stories_member_created
         ON profile_stories (member_id, created_at DESC)`,
      );
      await query(`
CREATE TABLE IF NOT EXISTS profile_story_views (
  story_id BIGINT NOT NULL REFERENCES profile_stories(id) ON DELETE CASCADE,
  viewer_member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, viewer_member_id)
)`);
      await query(
        `CREATE INDEX IF NOT EXISTS idx_profile_story_views_viewer
         ON profile_story_views (viewer_member_id)`,
      );
    })().catch((err) => {
      storiesSchemaReady = null;
      throw err;
    });
  }
  await storiesSchemaReady;
}

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
  await ensureStoriesSchema();
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

  if (!groups.some((g) => g.is_me)) {
    const me = authors.get(viewerMemberId);
    if (me) {
      groups.unshift({ author: me, stories: [], all_seen: true, is_me: true });
    }
  }

  // Affinity к авторам сторис (лайки/комменты к их постам) — умный порядок колец.
  const authorIds = groups.map((g) => g.author.member_id).filter((id) => id !== viewerMemberId);
  const affinity = new Map<number, { likes: number; comments: number }>();
  if (authorIds.length > 0) {
    const [likesAff, commentsAff] = await Promise.all([
      query(
        `SELECT p.member_id AS author_id, COUNT(*)::int AS cnt
         FROM profile_post_likes lk
         INNER JOIN profile_posts p ON p.id = lk.post_id
         WHERE lk.member_id = $1 AND p.member_id = ANY($2::int[])
         GROUP BY p.member_id`,
        [viewerMemberId, authorIds],
      ),
      query(
        `SELECT p.member_id AS author_id, COUNT(*)::int AS cnt
         FROM profile_post_comments cm
         INNER JOIN profile_posts p ON p.id = cm.post_id
         WHERE cm.member_id = $1 AND p.member_id = ANY($2::int[])
         GROUP BY p.member_id`,
        [viewerMemberId, authorIds],
      ),
    ]);
    for (const row of likesAff.rows as Array<{ author_id: number; cnt: number }>) {
      const prev = affinity.get(row.author_id) ?? { likes: 0, comments: 0 };
      prev.likes = Number(row.cnt ?? 0);
      affinity.set(row.author_id, prev);
    }
    for (const row of commentsAff.rows as Array<{ author_id: number; cnt: number }>) {
      const prev = affinity.get(row.author_id) ?? { likes: 0, comments: 0 };
      prev.comments = Number(row.cnt ?? 0);
      affinity.set(row.author_id, prev);
    }
  }

  const ranked = rankStoryGroups(
    groups.map((g) => {
      const aff = affinity.get(g.author.member_id) ?? { likes: 0, comments: 0 };
      const unseen = g.is_me ? 0 : g.stories.filter((s) => !s.viewed_by_me).length;
      const newest = g.stories[g.stories.length - 1]?.created_at
        ?? g.stories[0]?.created_at
        ?? new Date(0).toISOString();
      return {
        ...g,
        member_id: g.author.member_id,
        unseen_count: unseen,
        story_count: g.stories.length,
        newest_created_at: newest,
        author_likes_from_me: aff.likes,
        author_comments_from_me: aff.comments,
        has_avatar: Boolean(g.author.avatar_url),
      };
    }),
  );

  return ranked.map(({ author, stories, all_seen, is_me }) => ({
    author,
    stories,
    all_seen,
    is_me,
  }));
}

export async function createStory(input: {
  memberId: number;
  mediaUrl: string;
  mediaType: MediaType;
  caption?: string | null;
}): Promise<{ id: string; expires_at: string }> {
  await ensureStoriesSchema();
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
  await ensureStoriesSchema();
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
  await ensureStoriesSchema();
  const r = await query(
    `DELETE FROM profile_stories WHERE id = $1::bigint AND member_id = $2`,
    [storyId, memberId],
  );
  return (r.rowCount ?? 0) > 0;
}

export type StoryReplyResult = {
  conversationId: string;
  message: MessageWithSender;
};

/**
 * Ответ или реакция на историю → сообщение `story_reply` в личный чат с автором
 * (как ответы на Stories в Instagram).
 */
export async function replyToStory(input: {
  storyId: string;
  fromMemberId: number;
  text?: string | null;
  reaction?: string | null;
}): Promise<StoryReplyResult> {
  await ensureStoriesSchema();
  await ensureStoryReplyPayloadType();

  const text = typeof input.text === 'string' ? input.text.trim() : '';
  const reaction = typeof input.reaction === 'string' ? input.reaction.trim() : '';
  if (!text && !reaction) {
    throw Object.assign(new Error('Нужен текст ответа или реакция'), { code: 'empty_reply' });
  }
  if (text.length > REPLY_TEXT_MAX) {
    throw Object.assign(new Error(`Текст слишком длинный (макс. ${REPLY_TEXT_MAX})`), {
      code: 'text_too_long',
    });
  }
  if (reaction.length > REACTION_MAX) {
    throw Object.assign(new Error('Некорректная реакция'), { code: 'bad_reaction' });
  }

  const storyRes = await query(
    `SELECT
      s.id::text AS id,
      s.member_id,
      s.media_url,
      s.media_type::text AS media_type,
      s.caption
     FROM profile_stories s
     WHERE s.id = $1::bigint AND s.expires_at > NOW()
     LIMIT 1`,
    [input.storyId],
  );
  const story = storyRes.rows[0] as
    | {
        id: string;
        member_id: number;
        media_url: string;
        media_type: string;
        caption: string | null;
      }
    | undefined;
  if (!story) {
    throw Object.assign(new Error('Сторис не найдена или истекла'), { code: 'not_found' });
  }
  if (Number(story.member_id) === Number(input.fromMemberId)) {
    throw Object.assign(new Error('Нельзя ответить на свою историю'), { code: 'self_reply' });
  }

  const kind = reaction && !text ? 'reaction' : 'reply';
  const content = text || reaction;
  const conversationId = await findOrCreatePersonalConversation(
    input.fromMemberId,
    Number(story.member_id),
  );
  const message = await sendMessage(
    conversationId,
    input.fromMemberId,
    content,
    null,
    null,
    'story_reply',
    {
      kind,
      story_id: story.id,
      story_media_url: story.media_url,
      story_media_type: story.media_type === 'video' ? 'video' : 'image',
      story_caption: story.caption,
      story_author_id: Number(story.member_id),
      reaction: reaction || null,
      text: text || null,
    },
  );

  return { conversationId: String(conversationId), message };
}
