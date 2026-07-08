import type {LocalTableName} from '../db/schema';
import type {SyncOperation, SyncPushItem, SyncPushResponse, SyncPullResponse} from '../shared/songbook/types';

export const SYNC_TABLES: LocalTableName[] = ['songs', 'members'];

export interface ConflictRecord {
  table: LocalTableName;
  recordId?: string;
  clientId?: string;
  local: Record<string, unknown>;
  remote: Record<string, unknown>;
  winner: 'local' | 'remote';
}

export type PullChangesFn = (
  table: LocalTableName,
  since: string | null,
  cursor?: string | null,
) => Promise<SyncPullResponse>;

export type PushQueueFn = (items: SyncPushItem[]) => Promise<SyncPushResponse>;

export interface SyncEngineOptions {
  pullChanges: PullChangesFn;
  pushQueue: PushQueueFn;
  deviceId: string;
}

export type SyncOperationType = SyncOperation;
