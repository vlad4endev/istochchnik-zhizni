import {apiClient} from '../shared/apiClient';
import {getLastSyncedAt, setLastSyncedAt} from './syncQueue';

export type BootstrapSnapshot = {
  songs: Record<string, unknown>[];
  member: Record<string, unknown> | null;
  serverTime: string;
};

export async function fetchBootstrapSnapshot(): Promise<BootstrapSnapshot> {
  const {data} = await apiClient.get<BootstrapSnapshot>('/api/sync/bootstrap');
  return data;
}

/** True when songs have never been pulled (cold start / empty local catalog). */
export async function needsBootstrap(): Promise<boolean> {
  const last = await getLastSyncedAt('songs');
  return last <= 0;
}

export async function markBootstrapComplete(serverTimeIso: string): Promise<void> {
  const ms = Date.parse(serverTimeIso);
  const ts = Number.isFinite(ms) ? ms : Date.now();
  await setLastSyncedAt('songs', ts);
  await setLastSyncedAt('members', ts);
}
