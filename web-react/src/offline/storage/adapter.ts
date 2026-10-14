import type { OutboxRow, SyncTableName } from '../types';
import { getOfflineDb, tableFor, type LocalRecord } from '../db/dexieDb';

/**
 * Storage adapter interface. Dexie (IndexedDB) is the default for web + Capacitor WebView.
 * A SQLite adapter can implement the same surface later (@capacitor-community/sqlite).
 */
export interface OfflineStorageAdapter {
  getAll(table: SyncTableName): Promise<LocalRecord[]>;
  getById(table: SyncTableName, id: string): Promise<LocalRecord | undefined>;
  put(table: SyncTableName, row: LocalRecord): Promise<void>;
  bulkPut(table: SyncTableName, rows: LocalRecord[]): Promise<void>;
  softDelete(table: SyncTableName, id: string, at: string): Promise<void>;
  listOutboxPending(limit: number): Promise<OutboxRow[]>;
  putOutbox(row: OutboxRow): Promise<void>;
  updateOutbox(id: string, patch: Partial<OutboxRow>): Promise<void>;
  removeOutbox(id: string): Promise<void>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
}

class DexieAdapter implements OfflineStorageAdapter {
  async getAll(table: SyncTableName): Promise<LocalRecord[]> {
    const rows = await tableFor(table).toArray();
    return rows.filter((r) => !r.deleted_at);
  }

  async getById(table: SyncTableName, id: string): Promise<LocalRecord | undefined> {
    return tableFor(table).get(id);
  }

  async put(table: SyncTableName, row: LocalRecord): Promise<void> {
    await tableFor(table).put(row);
  }

  async bulkPut(table: SyncTableName, rows: LocalRecord[]): Promise<void> {
    await tableFor(table).bulkPut(rows);
  }

  async softDelete(table: SyncTableName, id: string, at: string): Promise<void> {
    const existing = await tableFor(table).get(id);
    if (!existing) return;
    await tableFor(table).put({ ...existing, deleted_at: at, updated_at: at, _syncStatus: 'local' });
  }

  async listOutboxPending(limit: number): Promise<OutboxRow[]> {
    return getOfflineDb()
      .outbox.where('status')
      .anyOf(['pending', 'error'])
      .sortBy('createdAt')
      .then((rows) => rows.slice(0, limit));
  }

  async putOutbox(row: OutboxRow): Promise<void> {
    await getOfflineDb().outbox.put(row);
  }

  async updateOutbox(id: string, patch: Partial<OutboxRow>): Promise<void> {
    await getOfflineDb().outbox.update(id, patch);
  }

  async removeOutbox(id: string): Promise<void> {
    await getOfflineDb().outbox.delete(id);
  }

  async getMeta(key: string): Promise<string | null> {
    const row = await getOfflineDb().meta.get(key);
    return row?.value ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    await getOfflineDb().meta.put({ key, value });
  }
}

let adapter: OfflineStorageAdapter = new DexieAdapter();

export function getStorageAdapter(): OfflineStorageAdapter {
  return adapter;
}

/** For tests / future SQLite swap. */
export function setStorageAdapter(next: OfflineStorageAdapter): void {
  adapter = next;
}
