import assert from 'node:assert/strict';

import { formatDriveApiError } from './googleDriveErrors';

function run(): void {
  assert.equal(
    formatDriveApiError(new Error('Google Drive: уже готово')),
    'Google Drive: уже готово',
  );

  const quota = {
    message: 'Request failed with status code 403',
    code: 403,
    response: {
      status: 403,
      data: {
        error: {
          message: "The user's Drive storage quota has been exceeded.",
          errors: [{ reason: 'storageQuotaExceeded' }],
        },
      },
    },
  };
  assert.match(formatDriveApiError(quota), /нет своей квоты/);

  const perms = {
    message: 'Request failed with status code 403',
    response: {
      status: 403,
      data: {
        error: {
          message: 'The user does not have sufficient permissions for this file.',
          errors: [{ reason: 'insufficientFilePermissions' }],
        },
      },
    },
  };
  assert.match(formatDriveApiError(perms), /нет права записи/);

  const missing = {
    message: 'Request failed with status code 404',
    response: { status: 404, data: { error: { message: 'File not found:' } } },
  };
  assert.match(formatDriveApiError(missing), /не найден/);

  const generic = new Error('Request failed with status code 500');
  assert.equal(formatDriveApiError(generic), 'Google Drive: Request failed with status code 500');

  console.log('googleDriveErrors.test.ts: ok');
}

run();
