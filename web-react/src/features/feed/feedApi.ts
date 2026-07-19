import { apiClient } from '../../lib/apiClient';
import type {
  ProfileFeedMediaType,
  ProfileFeedPostAuthor,
  ProfileFeedPostEmbedded,
} from '../profile/publicProfileApi';

export type FeedPost = {
  id: string;
  member_id: number;
  author: ProfileFeedPostAuthor;
  caption: string | null;
  created_at: string;
  media: Array<{ url: string; type: ProfileFeedMediaType; order: number }>;
  like_count: number;
  comment_count: number;
  repost_count: number;
  liked_by_me: boolean;
  reposted_by_me: boolean;
  shared_post: ProfileFeedPostEmbedded | null;
};

export type FeedSortMode = 'smart' | 'recent';

export type ChurchFeedPage = {
  posts: FeedPost[];
  next_cursor: string | null;
  sort?: FeedSortMode;
};

export type FeedComment = {
  id: string;
  post_id: string;
  member_id: number | null;
  text: string;
  created_at: string;
  author: ProfileFeedPostAuthor | null;
  like_count?: number;
  liked_by_me?: boolean;
};

export type StoryItem = {
  id: string;
  member_id: number;
  media_url: string;
  media_type: ProfileFeedMediaType;
  caption: string | null;
  created_at: string;
  expires_at: string;
  viewed_by_me: boolean;
};

export type StoryAuthorGroup = {
  author: ProfileFeedPostAuthor;
  stories: StoryItem[];
  all_seen: boolean;
  is_me: boolean;
};

export async function fetchChurchFeed(params?: {
  cursor?: string | null;
  limit?: number;
  sort?: FeedSortMode;
}): Promise<ChurchFeedPage> {
  const { data } = await apiClient.get<ChurchFeedPage>('/api/feed', {
    params: {
      cursor: params?.cursor || undefined,
      limit: params?.limit ?? 20,
      sort: params?.sort ?? 'smart',
    },
  });
  return data;
}

export async function fetchFeedUnreadCount(): Promise<number> {
  const { data } = await apiClient.get<{ count?: number }>('/api/feed/unread-count', {
    silentErrorToast: true,
  });
  const n = Number(data?.count);
  return Number.isFinite(n) && n > 0 ? Math.min(99, Math.floor(n)) : 0;
}

/** Сбрасывает бейдж новых постов: watermark = newest seen_at или NOW(). */
export async function markFeedSeen(seenAt?: string | null): Promise<void> {
  await apiClient.post(
    '/api/feed/mark-seen',
    seenAt ? { seen_at: seenAt } : {},
    { silentErrorToast: true },
  );
}

export async function fetchPostComments(postId: string): Promise<FeedComment[]> {
  const { data } = await apiClient.get<{ comments: FeedComment[] }>(
    `/api/posts/${encodeURIComponent(postId)}/comments`,
  );
  return data.comments ?? [];
}

export async function createPostComment(postId: string, text: string): Promise<{ id: string; created_at: string }> {
  const { data } = await apiClient.post<{ id: string; created_at: string }>(
    `/api/posts/${encodeURIComponent(postId)}/comment`,
    { text },
  );
  return data;
}

export async function deletePostComment(postId: string, commentId: string): Promise<void> {
  await apiClient.delete(`/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`);
}

export async function likePostComment(
  postId: string,
  commentId: string,
): Promise<{ like_count: number }> {
  const { data } = await apiClient.post<{ like_count?: number }>(
    `/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/like`,
  );
  return { like_count: Number(data?.like_count ?? 0) };
}

export async function unlikePostComment(
  postId: string,
  commentId: string,
): Promise<{ like_count: number }> {
  const { data } = await apiClient.delete<{ like_count?: number }>(
    `/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/like`,
  );
  return { like_count: Number(data?.like_count ?? 0) };
}

export async function fetchStories(): Promise<StoryAuthorGroup[]> {
  const { data } = await apiClient.get<{ groups: StoryAuthorGroup[] }>('/api/stories', {
    // Кольца рисуем локальным fallback; глобальный toast «Database error» не нужен.
    silentErrorToast: true,
  });
  return data.groups ?? [];
}

export async function createStory(params: { file: File; caption?: string }): Promise<void> {
  const form = new FormData();
  form.append('media', params.file);
  if (params.caption?.trim()) form.append('caption', params.caption.trim());
  await apiClient.post('/api/stories', form, { timeout: 120_000 });
}

export async function markStoryViewed(storyId: string): Promise<void> {
  await apiClient.post(`/api/stories/${encodeURIComponent(storyId)}/view`);
}

export async function deleteStory(storyId: string): Promise<void> {
  await apiClient.delete(`/api/stories/${encodeURIComponent(storyId)}`);
}

/** Ответ/реакция на историю → сообщение в личный чат с автором. */
export async function replyToStory(
  storyId: string,
  body: { text?: string; reaction?: string },
): Promise<{ conversationId: string }> {
  const { data } = await apiClient.post<{ conversationId?: string }>(
    `/api/stories/${encodeURIComponent(storyId)}/reply`,
    {
      text: body.text?.trim() || undefined,
      reaction: body.reaction?.trim() || undefined,
    },
  );
  return { conversationId: String(data?.conversationId ?? '') };
}
