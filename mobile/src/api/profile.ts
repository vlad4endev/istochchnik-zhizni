import { apiClient } from './client';

import type { FeedMediaType, FeedPostAuthor } from './feed';
import { normalizeAuthor } from './feed';

export type MeProfile = {
  id?: number;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  username?: string;
  app_role?: string;
  app_roles?: string[];
  registration_status?: string;
  prayer_request?: string | null;
  ministry_role?: string | null;
  ministry_direction?: string | null;
  is_collection_coordinator?: boolean;
  email?: string | null;
  birth_date?: string | null;
  avatar_url?: string | null;
};

export type PublicProfile = {
  member_id: number;
  username: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_private: boolean;
  created_at: string;
  updated_at: string;
};

export type ProfilePost = {
  id: string;
  member_id: number;
  caption: string | null;
  created_at: string;
  media: Array<{ url: string; type: FeedMediaType; order: number }>;
  like_count: number;
  comment_count: number;
  repost_count: number;
  liked_by_me: boolean;
  reposted_by_me: boolean;
};

export type ProfileFeedResponse = {
  profile: PublicProfile;
  posts: ProfilePost[];
};

export async function fetchMe(): Promise<MeProfile> {
  const { data } = await apiClient.get<MeProfile>('/api/auth/me');
  return data;
}

export async function patchProfilePrayerRequest(prayer_request: string): Promise<void> {
  await apiClient.patch('/api/auth/me', { prayer_request });
}

export async function patchMyProfile(body: {
  first_name?: string;
  last_name?: string;
  email?: string | null;
  birth_date?: string | null;
}): Promise<MeProfile> {
  const { data } = await apiClient.patch<MeProfile>('/api/auth/me', body);
  return data;
}

export async function patchPublicProfileSettings(body: {
  display_name?: string | null;
  bio?: string | null;
}): Promise<void> {
  await apiClient.patch('/api/profile/settings', body);
}

export async function fetchProfileByUsername(username: string): Promise<ProfileFeedResponse> {
  const enc = encodeURIComponent(username.trim());
  const { data } = await apiClient.get<{
    profile: PublicProfile;
    posts?: ProfilePost[];
  }>(`/api/profile/by-username/${enc}`);
  return { profile: data.profile, posts: data.posts ?? [] };
}

export async function fetchProfileByMemberId(memberId: number): Promise<ProfileFeedResponse> {
  const { data } = await apiClient.get<{
    profile: PublicProfile;
    posts?: ProfilePost[];
  }>(`/api/profile/${memberId}`);
  return { profile: data.profile, posts: data.posts ?? [] };
}

export function profileDisplayName(profile: PublicProfile | null | undefined): string {
  if (!profile) return 'Участник';
  const display = profile.display_name?.trim();
  if (display) return display;
  const full = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
  if (full) return full;
  if (profile.username?.trim()) return `@${profile.username.trim()}`;
  return 'Участник';
}

export function toFeedAuthor(profile: PublicProfile): FeedPostAuthor {
  return normalizeAuthor({
    member_id: profile.member_id,
    username: profile.username,
    first_name: profile.first_name,
    last_name: profile.last_name,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
  });
}

export async function uploadMyAvatar(asset: {
  uri: string;
  name: string;
  type: string;
}): Promise<MeProfile> {
  const form = new FormData();
  form.append('file', {
    uri: asset.uri,
    name: asset.name,
    type: asset.type,
  } as unknown as Blob);
  const { data } = await apiClient.post<MeProfile>('/api/auth/me/avatar', form, {
    timeout: 60_000,
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
