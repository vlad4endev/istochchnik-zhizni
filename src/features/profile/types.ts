export type PrivacyLevel = 'public' | 'followers' | 'private';
export type ThemeMode = 'system' | 'light' | 'dark';

export interface UserProfile {
  /** References the existing `members` table row. */
  memberId: number;

  /** Instagram-like profile fields */
  username: string;
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;

  /** Privacy settings */
  isPrivate: boolean;
  allowComments: PrivacyLevel;
  showActivityStatus: boolean;

  /** Theme preferences */
  theme: {
    mode: ThemeMode;
    accentColor?: string | null;
  };

  createdAt: string;
  updatedAt: string;
}

export interface Post {
  id: number;
  user: {
    memberId: number;
    username: string;
  };
  caption?: string | null;
  timestamp: string;
  media: MediaItem[];
}

export type MediaType = 'image' | 'video';

export interface MediaItem {
  url: string;
  type: MediaType;
  order: number;
}

export interface Comment {
  id: number;
  postId: number;
  user: {
    memberId: number;
    username: string;
  };
  text: string;
  timestamp: string;
}

