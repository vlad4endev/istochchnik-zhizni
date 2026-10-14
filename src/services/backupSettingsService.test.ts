import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BACKUP_RETENTION_DAYS_MAX,
  normalizeBackupSettingsDocument,
} from './backupSettingsService';

describe('normalizeBackupSettingsDocument', () => {
  it('returns safe defaults for empty input', () => {
    const doc = normalizeBackupSettingsDocument(null);
    assert.equal(doc.auto_enabled, false);
    assert.equal(doc.schedule_time, '03:30');
    assert.equal(doc.schedule_kind, 'daily');
    assert.deepEqual(doc.schedule_weekdays, [1]);
    assert.equal(doc.timezone, 'Europe/Moscow');
    assert.equal(doc.retention_days, BACKUP_RETENTION_DAYS_MAX);
    assert.equal(doc.telegram_target, 'admins');
  });

  it('clamps retention_days to 1..30', () => {
    assert.equal(normalizeBackupSettingsDocument({ retention_days: 0 }).retention_days, 1);
    assert.equal(normalizeBackupSettingsDocument({ retention_days: 999 }).retention_days, 30);
    assert.equal(normalizeBackupSettingsDocument({ retention_days: 14 }).retention_days, 14);
  });
});
