import {Q} from '@nozbe/watermelondb';

import {database, getFeedPostsCollection} from '../db';
import type FeedPost from '../db/models/FeedPost';
import type {FeedPostDto} from '../shared/feed/types';

function toMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Date.now();
}

export class FeedCacheRepository {
  async listCached(limit = 50): Promise<FeedPost[]> {
    return getFeedPostsCollection()
      .query(Q.sortBy('created_at', Q.desc), Q.take(limit))
      .fetch();
  }

  async replaceCache(posts: FeedPostDto[]): Promise<void> {
    const collection = getFeedPostsCollection();
    const existing = await collection.query().fetch();
    const now = Date.now();

    await database.write(async () => {
      for (const row of existing) {
        await row.destroyPermanently();
      }
      for (const post of posts) {
        await collection.create(row => {
          row.serverId = String(post.id);
          row.authorJson = JSON.stringify(post.author ?? {});
          row.caption = post.caption ?? null;
          row.mediaJson = JSON.stringify(post.media ?? []);
          row.likeCount = post.like_count ?? 0;
          row.commentCount = post.comment_count ?? 0;
          row.repostCount = post.repost_count ?? 0;
          row.likedByMe = Boolean(post.liked_by_me);
          row.createdAt = toMs(post.created_at);
          row.cachedAt = now;
        });
      }
    });
  }
}

export const feedCacheRepository = new FeedCacheRepository();
