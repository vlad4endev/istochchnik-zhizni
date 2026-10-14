import Dexie, { type Table } from 'dexie';

/** Local song row (mirrors /api/sync songs + list fields). */
export type OfflineSong = {
  /** Server id as string, or `local:<clientId>` before first push. */
  id: string;
  serverId: string | null;
  clientId: string | null;
  songNumber: number | null;
  title: string;
  slug: string;
  content: string;
  defaultKey: string | null;
  tempo: number | null;
  timeSignature: string | null;
  tags: string[];
  isPublished: boolean;
  isFavorite?: boolean;
  hasStudioVersion?: boolean;
  updatedAt: number;
  deletedAt: number | null;
  syncedAt: number | null;
};

export type OfflineMember = {
  id: string;
  firstName: string;
  lastName: string;
  username: string | null;
  appRole: string | null;
  updatedAt: number;
  deletedAt: number | null;
};

export type OfflineSyncMeta = {
  table: string;
  lastSyncedAt: number;
};

export type OfflineSyncQueueItem = {
  id?: number;
  queueId: string;
  table: 'songs';
  operation: 'create' | 'update' | 'delete';
  recordId: string | null;
  clientId: string | null;
  payload: Record<string, unknown>;
  deviceId: string | null;
  createdAt: number;
  attempts: number;
  lastError: string | null;
};

export type OfflineFeedPost = {
  id: string;
  authorJson: string;
  caption: string | null;
  mediaJson: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  likedByMe: boolean;
  createdAt: number;
  cachedAt: number;
};

export type OfflineMediaEvent = {
  id: string;
  title: string;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  eventType: string;
  assignmentsJson: string;
  cachedAt: number;
};

class OfflineDatabase extends Dexie {
  songs!: Table<OfflineSong, string>;
  members!: Table<OfflineMember, string>;
  syncMeta!: Table<OfflineSyncMeta, string>;
  syncQueue!: Table<OfflineSyncQueueItem, number>;
  feedPosts!: Table<OfflineFeedPost, string>;
  mediaEvents!: Table<OfflineMediaEvent, string>;

  constructor() {
    super('istochnik_offline_v1');
    this.version(1).stores({
      songs: 'id, serverId, clientId, title, updatedAt, deletedAt, isPublished',
      members: 'id, updatedAt, deletedAt',
      syncMeta: 'table',
      syncQueue: '++id, queueId, table, createdAt',
      feedPosts: 'id, createdAt, cachedAt',
      mediaEvents: 'id, eventDate, cachedAt',
    });
  }
}

export const offlineDb = new OfflineDatabase();

const DEVICE_ID_KEY = 'offline:device-id';

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing?.trim()) return existing.trim();
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `dev-${Date.now()}`;
  }
}

export function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}
