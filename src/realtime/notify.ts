import { broadcastRealtime } from './wsNotifyHub';

export type RealtimeScope =
  | 'calendar'
  | 'members'
  | 'global'
  | 'templates'
  | 'me'
  | 'broadcast'
  | 'resources'
  | 'notification-settings'
  | 'admin';

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
