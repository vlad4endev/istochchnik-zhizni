export type TimelineFilterMode = 'important' | 'issues' | 'all';

export type TimelineEventLike = { kind: string; severity: string };

/**
 * Технические замеры: в режиме «важные» скрыты, иначе на длинных звонках хронология
 * из сотен строк stats_sample/network_changed нечитаема. События остаются в режиме «все».
 */
export const QUIET_TIMELINE_KINDS: ReadonlySet<string> = new Set([
  'stats_sample',
  'network_changed',
  'quality_changed',
]);

export function isTimelineEventVisible(
  event: TimelineEventLike,
  mode: TimelineFilterMode,
): boolean {
  if (mode === 'all') return true;
  if (mode === 'issues') return event.severity === 'warn' || event.severity === 'error';
  return !QUIET_TIMELINE_KINDS.has(event.kind);
}

export function countTimelineMode(events: TimelineEventLike[], mode: TimelineFilterMode): number {
  let n = 0;
  for (const e of events) {
    if (isTimelineEventVisible(e, mode)) n += 1;
  }
  return n;
}

export const PARTICIPANT_STATUS_LABELS: Record<string, string> = {
  invited: 'Приглашён',
  ringing: 'Входящий',
  joined: 'В звонке',
  left: 'Вышел',
  declined: 'Отклонил',
  missed: 'Не ответил',
  busy: 'Занят',
};

export function participantStatusLabel(status: string): string {
  return PARTICIPANT_STATUS_LABELS[status] ?? status;
}
