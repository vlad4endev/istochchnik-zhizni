import {Q} from '@nozbe/watermelondb';

import {database, getMembersCollection} from '../db';
import type Member from '../db/models/Member';
import type {AuthProfile} from '../shared/auth/types';

export class MemberRepository {
  async upsertFromProfile(profile: AuthProfile): Promise<void> {
    if (!profile.memberId) return;
    const serverId = String(profile.memberId);
    const now = Date.now();
    const existing = await getMembersCollection().query(Q.where('server_id', serverId)).fetch();

    const apply = (row: Member) => {
      row.serverId = serverId;
      row.firstName = profile.firstName;
      row.lastName = profile.lastName;
      row.username = profile.username || null;
      row.appRole = profile.role;
      row.updatedAt = now;
      row.deletedAt = null;
      row.syncedAt = now;
    };

    await database.write(async () => {
      if (existing[0]) {
        await existing[0].update(apply);
      } else {
        await getMembersCollection().create(apply);
      }
    });
  }

  async getByServerId(serverId: string): Promise<Member | null> {
    const rows = await getMembersCollection().query(Q.where('server_id', serverId)).fetch();
    return rows[0] ?? null;
  }
}

export const memberRepository = new MemberRepository();
