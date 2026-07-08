import {database, getSyncConflictsCollection} from '../db';
import type {ConflictRecord} from './types';

export async function logConflict(conflict: ConflictRecord): Promise<void> {
  await database.write(async () => {
    await getSyncConflictsCollection().create(row => {
      row.tableName = conflict.table;
      row.recordId = conflict.recordId ?? null;
      row.clientId = conflict.clientId ?? null;
      row.localJson = JSON.stringify(conflict.local);
      row.remoteJson = JSON.stringify(conflict.remote);
      row.resolvedWith = conflict.winner;
      row.createdAt = Date.now();
    });
  });
}
