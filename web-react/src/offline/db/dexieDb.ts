import Dexie, { type Table } from 'dexie';

import type { OutboxRow, SyncTableName } from '../types';

export type LocalRecord = Record<string, unknown> & {
  id: string;
  client_id?: string | null;
  updated_at?: string;
  deleted_at?: string | null;
  version?: number;
  sync_seq?: string | null;
  _syncStatus?: string;
};

export type MetaRow = { key: string; value: string };

/** Schema version for local DB migrations. */
export const LOCAL_DB_VERSION = 1;

export class OfflineDexie extends Dexie {
  songs!: Table<LocalRecord, string>;
  members!: Table<LocalRecord, string>;
  church_events!: Table<LocalRecord, string>;
  sermon_notes!: Table<LocalRecord, string>;
  outbox!: Table<OutboxRow, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('istochnik_offline_v1');
    this.version(LOCAL_DB_VERSION).stores({
      songs: 'id, client_id, updated_at, sync_seq, deleted_at',
      members: 'id, client_id, updated_at, sync_seq, deleted_at',
      church_events: 'id, client_id, updated_at, sync_seq, deleted_at',
      sermon_notes: 'id, client_id, updated_at, sync_seq, deleted_at',
      outbox: 'id, tableName, status, createdAt',
      meta: 'key',
    });
  }
}

let dbSingleton: OfflineDexie | null = null;

export function getOfflineDb(): OfflineDexie {
  if (!dbSingleton) dbSingleton = new OfflineDexie();
  return dbSingleton;
}

export function tableFor(name: SyncTableName): Table<LocalRecord, string> {
  const db = getOfflineDb();
  return db[name];
}
