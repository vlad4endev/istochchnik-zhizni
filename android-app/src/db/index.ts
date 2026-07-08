import {Database} from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import {schema} from './schema';
import Song from './models/Song';
import Member from './models/Member';
import SyncQueueItem from './models/SyncQueueItem';
import SyncMetadata from './models/SyncMetadata';
import SyncConflict from './models/SyncConflict';

const adapter = new SQLiteAdapter({
  schema,
  jsi: true,
  onSetUpError: error => {
    console.error('[WatermelonDB] setup error', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [Song, Member, SyncQueueItem, SyncMetadata, SyncConflict],
});

export function getSongsCollection() {
  return database.get<Song>('songs');
}

export function getMembersCollection() {
  return database.get<Member>('members');
}

export function getSyncQueueCollection() {
  return database.get<SyncQueueItem>('sync_queue');
}

export function getSyncMetadataCollection() {
  return database.get<SyncMetadata>('sync_metadata');
}

export function getSyncConflictsCollection() {
  return database.get<SyncConflict>('sync_conflicts');
}
