import { apiClient } from '../../lib/apiClient';

export type ProfileFeedPrivacy = 'public' | 'followers' | 'private';
export type ProfileFeedThemeMode = 'system' | 'light' | 'dark';
export type ProfileFeedMediaType = 'image' | 'video';

export interface ProfileFeedProfile {
  member_id: number;
  username: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_private: boolean;
  allow_comments: ProfileFeedPrivacy;
  show_activity_status: boolean;
  theme_mode: ProfileFeedThemeMode;
  theme_accent_color: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileFeedPostAuthor {
  member_id: number;
  username: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface ProfileFeedPostEmbedded {
  id: string;
  member_id: number;
  author: ProfileFeedPostAuthor;
  caption: string | null;
  created_at: string;
  media: Array<{ url: string; type: ProfileFeedMediaType; order: number }>;
  like_count: number;
  comment_count: number;
  repost_count: number;
}

export interface ProfileFeedPost {
  id: string;
  member_id: number;
  caption: string | null;
  created_at: string;
  media: Array<{ url: string; type: ProfileFeedMediaType; order: number }>;
  like_count: number;
  comment_count: number;
  repost_count: number;
  liked_by_me: boolean;
  reposted_by_me: boolean;
  shared_post: ProfileFeedPostEmbedded | null;
}

export interface ProfileFeedResponse {
  profile: ProfileFeedProfile;
  posts: ProfileFeedPost[];
}

export async function fetchProfileByUsername(username: string): Promise<ProfileFeedResponse> {
  const enc = encodeURIComponent(username.trim());
  const { data } = await apiClient.get<ProfileFeedResponse>(`/api/profile/by-username/${enc}`);
  return data;
}

/** GET `/api/profile/:memberId` — те же данные, что у ленты по username. */
export async function fetchProfileByMemberId(memberId: number): Promise<ProfileFeedResponse> {
  const { data } = await apiClient.get<ProfileFeedResponse>(`/api/profile/${memberId}`);
  return data;
}

export async function patchPublicProfileSettings(body: {
  display_name?: string | null;
  bio?: string | null;
}): Promise<void> {
  await apiClient.patch('/api/profile/settings', body);
}

export async function createProfilePost(params: { files: File[]; caption: string }): Promise<void> {
  const cap = params.caption.trim();
  if (params.files.length === 0) {
    if (!cap) throw new Error('Пустая публикация');
    await apiClient.post('/api/posts', { caption: cap }, { timeout: 60_000 });
    return;
  }
  const form = new FormData();
  if (cap) form.append('caption', cap);
  for (const f of params.files) form.append('media', f);
  await apiClient.post('/api/posts', form, {
    timeout: 120_000,
  });
}

export async function likeProfilePost(postId: string): Promise<{ like_count: number }> {
  const { data } = await apiClient.post<{ like_count: number }>(`/api/posts/${encodeURIComponent(postId)}/like`);
  return { like_count: data.like_count };
}

export async function unlikeProfilePost(postId: string): Promise<{ like_count: number }> {
  const { data } = await apiClient.delete<{ like_count: number }>(`/api/posts/${encodeURIComponent(postId)}/like`);
  return { like_count: data.like_count };
}

export async function repostProfilePost(postId: string, caption?: string): Promise<void> {
  await apiClient.post(`/api/posts/${encodeURIComponent(postId)}/repost`, caption?.trim() ? { caption: caption.trim() } : {});
}

export async function patchProfilePostCaption(postId: string, caption: string): Promise<void> {
  await apiClient.patch(`/api/posts/${encodeURIComponent(postId)}`, { caption });
}

export async function deleteProfilePost(postId: string): Promise<void> {
  await apiClient.delete(`/api/posts/${encodeURIComponent(postId)}`);
}
