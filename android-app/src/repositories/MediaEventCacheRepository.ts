import {Q} from '@nozbe/watermelondb';

import {database, getMediaEventsCollection} from '../db';
import type MediaEvent from '../db/models/MediaEvent';
import type {MediaEventDto} from '../shared/mediaSchedule/types';

export class MediaEventCacheRepository {
  async listCached(): Promise<MediaEvent[]> {
    return getMediaEventsCollection().query(Q.sortBy('event_date', Q.asc)).fetch();
  }

  async replaceCache(events: MediaEventDto[]): Promise<void> {
    const collection = getMediaEventsCollection();
    const existing = await collection.query().fetch();
    const now = Date.now();

    await database.write(async () => {
      for (const row of existing) {
        await row.destroyPermanently();
      }
      for (const event of events) {
        const refId = String(event.event_ref_id ?? event.id);
        await collection.create(row => {
          row.serverId = refId;
          row.title = event.title;
          row.eventDate = event.event_date;
          row.startTime = event.start_time ?? null;
          row.endTime = event.end_time ?? null;
          row.eventType = event.event_type;
          row.assignmentsJson = JSON.stringify(
            (event.assignments ?? []).map(a => ({
              id: a.id,
              member_name: a.member?.name,
              role_name: a.role?.name,
              status: a.status,
            })),
          );
          row.payloadJson = JSON.stringify(event);
          row.cachedAt = now;
        });
      }
    });
  }
}

export const mediaEventCacheRepository = new MediaEventCacheRepository();
