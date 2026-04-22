import { broadcastRealtime } from './wsHub';

export type RealtimeScope =
  | 'calendar'
  | 'coordinator-notes'
  | 'members'
  | 'global'
  | 'templates'
  | 'me'
  | 'broadcast'
  | 'resources'
  | 'notification-settings'
  | 'admin'
  | 'service-planner';

export function notifyRealtime(scopes: RealtimeScope[]): void {
  const unique = [...new Set(scopes)];
  if (unique.length === 0) {
    return;
  }
  broadcastRealtime({
    v: 1,
    type: 'invalidate',
    scopes: unique,
    ts: Date.now(),
  });
}
