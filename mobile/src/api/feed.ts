import { apiClient } from './client';

export type FeedMediaType = 'image' | 'video';

export type FeedPostAuthor = {
  id: number;
  name: string;
  username?: string | null;
  avatar_url?: string | null;
};

export type FeedPost = {
  id: string;
  member_id: number;
  author: FeedPostAuthor;
  caption: string | null;
  created_at: string;
  media: Array<{ url: string; type: FeedMediaType; order: number }>;
  like_count: number;
  comment_count: number;
  repost_count: number;
  liked_by_me: boolean;
  reposted_by_me: boolean;
};

export type ChurchFeedPage = {
  posts: FeedPost[];
  next_cursor: string | null;
};

export async function fetchChurchFeed(params?: {
  cursor?: string | null;
  limit?: number;
}): Promise<ChurchFeedPage> {
  const { data } = await apiClient.get<ChurchFeedPage>('/api/feed', {
    params: {
      cursor: params?.cursor || undefined,
      limit: params?.limit ?? 20,
      sort: 'recent',
    },
  });
  return {
    posts: data.posts ?? [],
    next_cursor: data.next_cursor ?? null,
  };
}

export async function likeFeedPost(postId: string): Promise<void> {
  await apiClient.post(`/api/posts/${encodeURIComponent(postId)}/like`);
}

export async function unlikeFeedPost(postId: string): Promise<void> {
  await apiClient.delete(`/api/posts/${encodeURIComponent(postId)}/like`);
}

export async function markFeedSeen(seenAt?: string | null): Promise<void> {
  await apiClient.post('/api/feed/mark-seen', seenAt ? { seen_at: seenAt } : {});
}
