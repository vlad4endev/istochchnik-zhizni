import assert from 'node:assert/strict';

import { normalizeBackupSettingsDocument } from './backupSettingsService';

function run(): void {
  const empty = normalizeBackupSettingsDocument(null);
  assert.equal(empty.drive_enabled, false);
  assert.equal(empty.drive_delete_local_after_upload, true);
  assert.equal(empty.drive_folder_id, null);
  assert.ok(empty.drive_retention_days >= 1 && empty.drive_retention_days <= 30);

  const withUrl = normalizeBackupSettingsDocument({
    drive_enabled: true,
    drive_folder_id: 'https://drive.google.com/drive/folders/1AbCdefGHIjkl_mnopQRsTUVwxyZ',
    drive_delete_local_after_upload: false,
    drive_retention_days: 14,
  });
  assert.equal(withUrl.drive_enabled, true);
  assert.equal(withUrl.drive_folder_id, '1AbCdefGHIjkl_mnopQRsTUVwxyZ');
  assert.equal(withUrl.drive_delete_local_after_upload, false);
  assert.equal(withUrl.drive_retention_days, 14);

  const capped = normalizeBackupSettingsDocument({ drive_retention_days: 999 });
  assert.equal(capped.drive_retention_days, 30);

  console.log('backupSettingsDrive.test.ts: ok');
}

run();
