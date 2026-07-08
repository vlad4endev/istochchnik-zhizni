import {Model} from '@nozbe/watermelondb';
import {field} from '@nozbe/watermelondb/decorators';

export default class SyncConflict extends Model {
  static table = 'sync_conflicts';

  @field('table_name') tableName!: string;
  @field('record_id') recordId!: string | null;
  @field('client_id') clientId!: string | null;
  @field('local_json') localJson!: string;
  @field('remote_json') remoteJson!: string;
  @field('resolved_with') resolvedWith!: string;
  @field('created_at') createdAt!: number;
}
