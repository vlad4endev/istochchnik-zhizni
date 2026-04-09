import { apiClient } from '../../lib/apiClient';

export type ProfileFeedPrivacy = 'public' | 'followers' | 'private';
export type ProfileFeedThemeMode = 'system' | 'light' | 'dark';
export type ProfileFeedMediaType = 'image' | 'video';

export interface ProfileFeedProfile {
  member_id: number;
  username: string;
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

export interface ProfileFeedPost {
  id: string;
  member_id: number;
  caption: string | null;
  created_at: string;
  media: Array<{ url: string; type: ProfileFeedMediaType; order: number }>;
  like_count: number;
  comment_count: number;
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
