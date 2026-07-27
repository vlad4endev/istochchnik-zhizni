import { query } from '../config/db';
import { resolveRepostRoot } from './profileService';
import { sendPush } from './pushService';

async function resolveActorLabel(memberId: number): Promise<string> {
  const r = await query(
    `SELECT COALESCE(
       NULLIF(TRIM(up.display_name), ''),
       NULLIF(TRIM(CONCAT(COALESCE(m.first_name, ''), ' ', COALESCE(m.last_name, ''))), ''),
       NULLIF(TRIM(m.name), ''),
       NULLIF(TRIM(up.username), ''),
       'Участник'
     ) AS label
     FROM members m
     LEFT JOIN user_profiles up ON up.member_id = m.id
     WHERE m.id = $1
     LIMIT 1`,
    [memberId],
  );
  const label = String((r.rows[0] as { label?: string } | undefined)?.label ?? '').trim();
  return label || 'Участник';
}

async function resolvePostOwnerId(postId: string): Promise<number | null> {
  const r = await query(`SELECT member_id FROM profile_posts WHERE id = $1::bigint LIMIT 1`, [postId]);
  const id = Number((r.rows[0] as { member_id?: unknown } | undefined)?.member_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function truncateText(text: string, max = 120): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

async function notifyOwner(params: {
  ownerId: number;
  actorId: number;
  title: string;
  body: string;
  kind: 'feed_like' | 'feed_comment' | 'feed_repost';
  postId: string;
  tag: string;
}): Promise<void> {
  if (params.ownerId === params.actorId) return;
  await sendPush(params.ownerId, params.title, params.body, {
    url: '/feed',
    kind: params.kind,
    type: params.kind,
    postId: params.postId,
    actorId: String(params.actorId),
    tag: params.tag,
    badge: '/assets/pwa-64x64.png',
    icon: '/assets/pwa-192x192.png',
  });
}

/** Пуш автору поста: новый лайк (только если лайк реально добавлен). */
export async function notifyPostLiked(postId: string, actorMemberId: number): Promise<void> {
  const ownerId = await resolvePostOwnerId(postId);
  if (ownerId == null) return;
  const actor = await resolveActorLabel(actorMemberId);
  await notifyOwner({
    ownerId,
    actorId: actorMemberId,
    title: actor,
    body: 'нравится ваша публикация',
    kind: 'feed_like',
    postId,
    tag: `feed-like-${postId}-${actorMemberId}`,
  });
}

/** Пуш автору поста: новый комментарий. */
export async function notifyPostCommented(
  postId: string,
  actorMemberId: number,
  commentText: string,
): Promise<void> {
  const ownerId = await resolvePostOwnerId(postId);
  if (ownerId == null) return;
  const actor = await resolveActorLabel(actorMemberId);
  const snippet = truncateText(commentText);
  await notifyOwner({
    ownerId,
    actorId: actorMemberId,
    title: actor,
    body: snippet ? `прокомментировал(а): ${snippet}` : 'прокомментировал(а) вашу публикацию',
    kind: 'feed_comment',
    postId,
    tag: `feed-comment-${postId}-${actorMemberId}-${Date.now()}`,
  });
}

/** Пуш автору оригинала: кто-то сделал репост. */
export async function notifyPostReposted(sourcePostId: string, actorMemberId: number): Promise<void> {
  const rootId = await resolveRepostRoot(sourcePostId);
  const ownerId = await resolvePostOwnerId(rootId);
  if (ownerId == null) return;
  const actor = await resolveActorLabel(actorMemberId);
  await notifyOwner({
    ownerId,
    actorId: actorMemberId,
    title: actor,
    body: 'поделился(ась) вашей публикацией',
    kind: 'feed_repost',
    postId: rootId,
    tag: `feed-repost-${rootId}-${actorMemberId}`,
  });
}
