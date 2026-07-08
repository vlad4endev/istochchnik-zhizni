import {Model} from '@nozbe/watermelondb';
import {field} from '@nozbe/watermelondb/decorators';

export default class Member extends Model {
  static table = 'members';

  @field('server_id') serverId!: string;
  @field('first_name') firstName!: string;
  @field('last_name') lastName!: string;
  @field('username') username!: string | null;
  @field('app_role') appRole!: string | null;
  @field('updated_at') updatedAt!: number;
  @field('deleted_at') deletedAt!: number | null;
  @field('synced_at') syncedAt!: number | null;
}
