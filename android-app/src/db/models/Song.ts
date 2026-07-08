import {Model} from '@nozbe/watermelondb';
import {field} from '@nozbe/watermelondb/decorators';

export default class Song extends Model {
  static table = 'songs';

  @field('server_id') serverId!: string | null;
  @field('client_id') clientId!: string | null;
  @field('song_number') songNumber!: number | null;
  @field('title') title!: string;
  @field('slug') slug!: string;
  @field('content') content!: string;
  @field('default_key') defaultKey!: string | null;
  @field('tempo') tempo!: number | null;
  @field('time_signature') timeSignature!: string | null;
  @field('tags_json') tagsJson!: string;
  @field('is_published') isPublished!: boolean;
  @field('updated_at') updatedAt!: number;
  @field('deleted_at') deletedAt!: number | null;
  @field('synced_at') syncedAt!: number | null;
  @field('created_by_device') createdByDevice!: string | null;

  get tags(): string[] {
    try {
      const parsed = JSON.parse(this.tagsJson || '[]');
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }

  get displayId(): string {
    return this.serverId ?? this.clientId ?? this.id;
  }

  get isDeleted(): boolean {
    return this.deletedAt != null;
  }
}
