export type FeedAuthorDto = {
  id?: number;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  avatar_url?: string | null;
};

export type FeedMediaDto = {
  url: string;
  type: string;
  order: number;
};

export type FeedPostDto = {
  id: string;
  member_id: number;
  author: FeedAuthorDto;
  caption: string | null;
  created_at: string;
  media: FeedMediaDto[];
  like_count: number;
  comment_count: number;
  repost_count: number;
  liked_by_me: boolean;
  reposted_by_me?: boolean;
};

export type ChurchFeedPage = {
  posts: FeedPostDto[];
  next_cursor: string | null;
  sort?: string;
};
