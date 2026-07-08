import {Model} from '@nozbe/watermelondb';
import {field} from '@nozbe/watermelondb/decorators';

export default class SyncQueueItem extends Model {
  static table = 'sync_queue';

  @field('queue_id') queueId!: string;
  @field('table_name') tableName!: string;
  @field('operation') operation!: string;
  @field('record_id') recordId!: string | null;
  @field('client_id') clientId!: string | null;
  @field('payload_json') payloadJson!: string;
  @field('device_id') deviceId!: string | null;
  @field('created_at') createdAt!: number;
  @field('attempts') attempts!: number;
  @field('last_error') lastError!: string | null;

  get payload(): Record<string, unknown> {
    try {
      return JSON.parse(this.payloadJson || '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
