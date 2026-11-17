import { apiClient } from './client';
import type { MediaEvent } from './mediaSchedule';

/** Расписание прославления имеет ту же форму, что и медиа-расписание. */
export type MusicEvent = MediaEvent;

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function fetchMyMusicSchedule(from: Date, to: Date): Promise<MusicEvent[]> {
  const { data } = await apiClient.get<{ events: MusicEvent[] }>(
    '/api/music-schedule/my-schedule',
    { params: { from: formatYmd(from), to: formatYmd(to) } },
  );
  return (data.events ?? []).map((raw) => {
    const refId = raw.event_ref_id ?? raw.id;
    return { ...raw, id: refId, event_ref_id: refId, assignments: raw.assignments ?? [] };
  });
}

export async function updateMusicAssignmentStatus(
  assignmentId: number,
  status: 'confirmed' | 'declined',
): Promise<void> {
  await apiClient.patch(`/api/music-schedule/assignments/${assignmentId}/status`, { status });
}
