import {Model} from '@nozbe/watermelondb';
import {field} from '@nozbe/watermelondb/decorators';

export type MediaAssignmentSummary = {
  id: number;
  member_name?: string;
  role_name?: string;
  status?: string;
};

export default class MediaEvent extends Model {
  static table = 'media_events';

  @field('server_id') serverId!: string;
  @field('title') title!: string;
  @field('event_date') eventDate!: string;
  @field('start_time') startTime!: string | null;
  @field('end_time') endTime!: string | null;
  @field('event_type') eventType!: string;
  @field('assignments_json') assignmentsJson!: string;
  @field('payload_json') payloadJson!: string;
  @field('cached_at') cachedAt!: number;

  get assignments(): MediaAssignmentSummary[] {
    try {
      const parsed = JSON.parse(this.assignmentsJson || '[]');
      return Array.isArray(parsed) ? (parsed as MediaAssignmentSummary[]) : [];
    } catch {
      return [];
    }
  }
}
