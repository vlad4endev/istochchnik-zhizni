export type SyncTableName = 'songs' | 'members' | 'church_events' | 'sermon_notes';

export type SyncOperation = 'create' | 'update' | 'delete';

export type OutboxStatus = 'pending' | 'syncing' | 'error' | 'done';

export type EntitySyncUiStatus = 'local' | 'syncing' | 'synced' | 'error';

export interface SyncEntityBase {
  id: string;
  client_id: string | null;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  sync_seq: string | null;
  device_id: string | null;
  _syncStatus?: EntitySyncUiStatus;
}

export interface OutboxRow {
  id: string;
  tableName: SyncTableName;
  operation: SyncOperation;
  recordId: string | null;
  clientId: string | null;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  deviceId: string;
  attempts: number;
  status: OutboxStatus;
  lastError: string | null;
  createdAt: string;
}

export interface SyncPushItem {
  id: string;
  table: SyncTableName;
  operation: SyncOperation;
  recordId?: string;
  clientId?: string;
  payload: Record<string, unknown>;
  createdAt: string;
  deviceId?: string;
  idempotencyKey?: string;
}

export interface SyncPushResult {
  id: string;
  ok: boolean;
  serverId?: string;
  error?: string;
  status?: 'applied' | 'conflict' | 'rejected';
  conflict?: boolean;
  record?: Record<string, unknown>;
}
