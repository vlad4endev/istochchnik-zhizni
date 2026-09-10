import { apiClient } from './client';

export type FeedMediaType = 'image' | 'video';

export type FeedPostAuthor = {
  member_id: number;
  username: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
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

export type FeedComment = {
  id: string;
  post_id: string;
  member_id: number | null;
  text: string;
  created_at: string;
  author: FeedPostAuthor | null;
  like_count?: number;
  liked_by_me?: boolean;
};

export type StoryItem = {
  id: string;
  member_id: number;
  media_url: string;
  media_type: FeedMediaType;
  caption: string | null;
  created_at: string;
  expires_at: string;
  viewed_by_me: boolean;
};

export type StoryAuthorGroup = {
  author: FeedPostAuthor;
  stories: StoryItem[];
  all_seen: boolean;
  is_me: boolean;
};

export type ChurchFeedPage = {
  posts: FeedPost[];
  next_cursor: string | null;
};

export function authorDisplayName(author: FeedPostAuthor | null | undefined): string {
  if (!author) return 'Участник';
  const display = author.display_name?.trim();
  if (display) return display;
  const full = `${author.first_name ?? ''} ${author.last_name ?? ''}`.trim();
  if (full) return full;
  if (author.username?.trim()) return `@${author.username.trim()}`;
  return 'Участник';
}

/** Нормализация автора: API отдаёт member_id/display_name; старые клиенты могли ждать id/name. */
export function normalizeAuthor(raw: unknown): FeedPostAuthor {
  const a = (raw ?? {}) as Record<string, unknown>;
  const memberId = Number(a.member_id ?? a.id ?? 0);
  return {
    member_id: Number.isFinite(memberId) ? memberId : 0,
    username: String(a.username ?? ''),
    first_name: (a.first_name as string | null) ?? null,
    last_name: (a.last_name as string | null) ?? null,
    display_name:
      (a.display_name as string | null) ??
      (typeof a.name === 'string' ? a.name : null),
    avatar_url: (a.avatar_url as string | null) ?? null,
  };
}

function normalizePost(raw: Record<string, unknown>): FeedPost {
  return {
    id: String(raw.id),
    member_id: Number(raw.member_id ?? 0),
    author: normalizeAuthor(raw.author),
    caption: (raw.caption as string | null) ?? null,
    created_at: String(raw.created_at ?? ''),
    media: Array.isArray(raw.media)
      ? (raw.media as FeedPost['media'])
      : [],
    like_count: Number(raw.like_count ?? 0),
    comment_count: Number(raw.comment_count ?? 0),
    repost_count: Number(raw.repost_count ?? 0),
    liked_by_me: Boolean(raw.liked_by_me),
    reposted_by_me: Boolean(raw.reposted_by_me),
  };
}

export async function fetchChurchFeed(params?: {
  cursor?: string | null;
  limit?: number;
}): Promise<ChurchFeedPage> {
  const { data } = await apiClient.get<{
    posts?: Record<string, unknown>[];
    next_cursor?: string | null;
  }>('/api/feed', {
    params: {
      cursor: params?.cursor || undefined,
      limit: params?.limit ?? 20,
      sort: 'recent',
    },
  });
  return {
    posts: (data.posts ?? []).map(normalizePost),
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

export async function fetchPostComments(postId: string): Promise<FeedComment[]> {
  const { data } = await apiClient.get<{ comments?: Array<Record<string, unknown>> }>(
    `/api/posts/${encodeURIComponent(postId)}/comments`,
  );
  return (data.comments ?? []).map((c) => ({
    id: String(c.id),
    post_id: String(c.post_id ?? postId),
    member_id: c.member_id == null ? null : Number(c.member_id),
    text: String(c.text ?? ''),
    created_at: String(c.created_at ?? ''),
    author: c.author ? normalizeAuthor(c.author) : null,
    like_count: Number(c.like_count ?? 0),
    liked_by_me: Boolean(c.liked_by_me),
  }));
}

export async function createPostComment(postId: string, text: string): Promise<void> {
  await apiClient.post(`/api/posts/${encodeURIComponent(postId)}/comment`, { text });
}

export async function createTextPost(caption: string): Promise<void> {
  const cap = caption.trim();
  if (!cap) throw new Error('Пустая публикация');
  await apiClient.post('/api/posts', { caption: cap }, { timeout: 60_000 });
}

export type LocalMediaAsset = {
  uri: string;
  name: string;
  type: string;
};

export async function createMediaPost(params: {
  caption: string;
  assets: LocalMediaAsset[];
}): Promise<void> {
  const form = new FormData();
  const cap = params.caption.trim();
  if (cap) form.append('caption', cap);
  for (const asset of params.assets) {
    form.append('media', {
      uri: asset.uri,
      name: asset.name,
      type: asset.type,
    } as unknown as Blob);
  }
  await apiClient.post('/api/posts', form, {
    timeout: 120_000,
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export async function fetchStories(): Promise<StoryAuthorGroup[]> {
  const { data } = await apiClient.get<{ groups?: Array<Record<string, unknown>> }>(
    '/api/stories',
  );
  return (data.groups ?? []).map((g) => ({
    author: normalizeAuthor(g.author),
    stories: Array.isArray(g.stories)
      ? (g.stories as StoryItem[])
      : [],
    all_seen: Boolean(g.all_seen),
    is_me: Boolean(g.is_me),
  }));
}

export async function markStoryViewed(storyId: string): Promise<void> {
  await apiClient.post(`/api/stories/${encodeURIComponent(storyId)}/view`);
}

export async function createStory(params: {
  asset: LocalMediaAsset;
  caption?: string;
}): Promise<void> {
  const form = new FormData();
  form.append('media', {
    uri: params.asset.uri,
    name: params.asset.name,
    type: params.asset.type,
  } as unknown as Blob);
  if (params.caption?.trim()) form.append('caption', params.caption.trim());
  await apiClient.post('/api/stories', form, {
    timeout: 120_000,
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export async function repostFeedPost(postId: string, caption?: string): Promise<void> {
  await apiClient.post(
    `/api/posts/${encodeURIComponent(postId)}/repost`,
    caption?.trim() ? { caption: caption.trim() } : {},
  );
}

export async function deleteFeedPost(postId: string): Promise<void> {
  await apiClient.delete(`/api/posts/${encodeURIComponent(postId)}`);
}

export async function deleteStory(storyId: string): Promise<void> {
  await apiClient.delete(`/api/stories/${encodeURIComponent(storyId)}`);
}

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
