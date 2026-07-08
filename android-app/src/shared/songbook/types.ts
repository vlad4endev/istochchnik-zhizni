export interface SongListItem {
  id: string;
  song_number: number | null;
  title: string;
  slug: string;
  content: string;
  default_key: string | null;
  tempo: number | null;
  time_signature: string | null;
  tags: string[];
  is_published: boolean;
  has_studio_version?: boolean;
  is_favorite?: boolean;
  updated_at?: string;
  deleted_at?: string | null;
  client_id?: string | null;
}

export type SyncOperation = 'create' | 'update' | 'delete';

export type SyncTableName = 'songs' | 'members';

export interface SyncQueuePayload {
  table: SyncTableName;
  operation: SyncOperation;
  recordId?: string;
  clientId?: string;
  payload: Record<string, unknown>;
  deviceId?: string;
}

export interface SyncPullResponse {
  table: string;
  records: Record<string, unknown>[];
  nextCursor: string | null;
  serverTime: string;
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
}

export interface SyncPushResult {
  id: string;
  ok: boolean;
  serverId?: string;
  error?: string;
  conflict?: boolean;
}

export interface SyncPushResponse {
  results: SyncPushResult[];
  serverTime: string;
}
