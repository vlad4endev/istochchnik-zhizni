import Dexie, { type Table } from 'dexie';

import type { ChurchFeedPage, FeedPost } from '../features/feed/feedApi';

type OfflineFeedPost = {
  id: string;
  authorJson: string;
  caption: string | null;
  mediaJson: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  likedByMe: boolean;
  createdAt: number;
  cachedAt: number;
};

/** Separate from sync DB (`istochnik_offline_v1`) — feed is cache-only. */
class FeedCacheDatabase extends Dexie {
  feedPosts!: Table<OfflineFeedPost, string>;

  constructor() {
    super('istochnik_feed_cache_v1');
    this.version(1).stores({
      feedPosts: 'id, createdAt, cachedAt',
    });
  }
}

const feedDb = new FeedCacheDatabase();

export async function cacheFeedPage(page: ChurchFeedPage): Promise<void> {
  const now = Date.now();
  await feedDb.transaction('rw', feedDb.feedPosts, async () => {
    const existing = await feedDb.feedPosts.orderBy('createdAt').reverse().toArray();
    const keepIds = new Set((page.posts ?? []).map((p) => String(p.id)));
    for (const post of page.posts ?? []) {
      await feedDb.feedPosts.put({
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
    if ((page.posts?.length ?? 0) > 0 && !page.next_cursor) {
      for (const row of existing) {
        if (!keepIds.has(row.id) && existing.length > 80) {
          await feedDb.feedPosts.delete(row.id);
        }
      }
    }
  });
}

export async function listCachedFeed(limit = 30): Promise<FeedPost[]> {
  const rows = await feedDb.feedPosts.orderBy('createdAt').reverse().limit(limit).toArray();
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
