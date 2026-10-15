import {Model} from '@nozbe/watermelondb';
import {field} from '@nozbe/watermelondb/decorators';

export type FeedAuthor = {
  id?: number;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  avatar_url?: string | null;
};

export type FeedMediaItem = {
  url: string;
  type: string;
  order: number;
};

export default class FeedPost extends Model {
  static table = 'feed_posts';

  @field('server_id') serverId!: string;
  @field('author_json') authorJson!: string;
  @field('caption') caption!: string | null;
  @field('media_json') mediaJson!: string;
  @field('like_count') likeCount!: number;
  @field('comment_count') commentCount!: number;
  @field('repost_count') repostCount!: number;
  @field('liked_by_me') likedByMe!: boolean;
  @field('created_at') createdAt!: number;
  @field('cached_at') cachedAt!: number;

  get author(): FeedAuthor {
    try {
      return JSON.parse(this.authorJson || '{}') as FeedAuthor;
    } catch {
      return {};
    }
  }

  get media(): FeedMediaItem[] {
    try {
      const parsed = JSON.parse(this.mediaJson || '[]');
      return Array.isArray(parsed) ? (parsed as FeedMediaItem[]) : [];
    } catch {
      return [];
    }
  }

  get authorLabel(): string {
    const a = this.author;
    if (a.display_name?.trim()) return a.display_name.trim();
    const name = [a.first_name, a.last_name].filter(Boolean).join(' ').trim();
    return name || 'Участник';
  }
}
