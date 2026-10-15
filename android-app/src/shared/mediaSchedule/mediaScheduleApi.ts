import {apiClient} from '../apiClient';
import type {MediaEventDto} from './types';

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeEvent(raw: MediaEventDto): MediaEventDto {
  const refId = raw.event_ref_id ?? raw.id;
  return {
    ...raw,
    id: refId,
    event_ref_id: refId,
    assignments: (raw.assignments ?? []).map(a => ({
      ...a,
      event_ref_id: a.event_ref_id ?? refId,
    })),
  };
}

export async function fetchMyMediaSchedule(from: Date, to: Date): Promise<MediaEventDto[]> {
  const {data} = await apiClient.get<{events: MediaEventDto[]}>(
    '/api/media-schedule/my-schedule',
    {
      params: {from: formatYmd(from), to: formatYmd(to)},
    },
  );
  return (data.events ?? []).map(normalizeEvent);
}

export function defaultMediaScheduleRange(): {from: Date; to: Date} {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 28);
  return {from, to};
}
