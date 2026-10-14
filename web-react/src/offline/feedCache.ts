import type { ChurchFeedPage, FeedPost } from '../features/feed/feedApi';

import { offlineDb } from './db';

export async function cacheFeedPage(page: ChurchFeedPage): Promise<void> {
  const now = Date.now();
  await offlineDb.transaction('rw', offlineDb.feedPosts, async () => {
    // Keep a rolling window of recent posts for offline reading.
    const existing = await offlineDb.feedPosts.orderBy('createdAt').reverse().toArray();
    const keepIds = new Set((page.posts ?? []).map((p) => String(p.id)));
    for (const post of page.posts ?? []) {
      await offlineDb.feedPosts.put({
        id: String(post.id),
        authorJson: JSON.stringify(post.author ?? {}),
        caption: post.caption,
        mediaJson: JSON.stringify(post.media ?? []),
        likeCount: post.like_count ?? 0,
        commentCount: post.comment_count ?? 0,
        repostCount: post.repost_count ?? 0,
        likedByMe: Boolean(post.liked_by_me),
        createdAt: Date.parse(post.created_at) || now,
        cachedAt: now,
      });
    }
    // Drop stale cached posts not in the latest page when online refresh replaced the head.
    if ((page.posts?.length ?? 0) > 0 && !page.next_cursor) {
      for (const row of existing) {
        if (!keepIds.has(row.id) && existing.length > 80) {
          await offlineDb.feedPosts.delete(row.id);
        }
      }
    }
  });
}

export async function listCachedFeed(limit = 30): Promise<FeedPost[]> {
  const rows = await offlineDb.feedPosts.orderBy('createdAt').reverse().limit(limit).toArray();
  return rows.map((row) => {
    let author: FeedPost['author'];
    let media: FeedPost['media'];
    try {
      author = JSON.parse(row.authorJson) as FeedPost['author'];
    } catch {
      author = {
        member_id: 0,
        username: '',
        first_name: null,
        last_name: null,
        display_name: 'Участник',
        avatar_url: null,
      };
    }
    try {
      media = JSON.parse(row.mediaJson) as FeedPost['media'];
    } catch {
      media = [];
    }
    return {
      id: row.id,
      member_id: author?.member_id ?? 0,
      author,
      caption: row.caption,
      created_at: new Date(row.createdAt).toISOString(),
      media,
      like_count: row.likeCount,
      comment_count: row.commentCount,
      repost_count: row.repostCount,
      liked_by_me: row.likedByMe,
      reposted_by_me: false,
      shared_post: null,
    };
  });
}
