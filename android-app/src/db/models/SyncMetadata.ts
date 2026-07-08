import {Model} from '@nozbe/watermelondb';
import {field} from '@nozbe/watermelondb/decorators';

export default class SyncMetadata extends Model {
  static table = 'sync_metadata';

  @field('table_name') tableName!: string;
  @field('last_synced_at') lastSyncedAt!: number;
}
