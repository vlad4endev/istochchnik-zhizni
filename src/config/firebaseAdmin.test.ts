import assert from 'node:assert/strict';

// Повреждённый ключ сервисного аккаунта не должен ронять API при старте: FCM просто отключается.
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: 'service_account',
  project_id: 'test',
  private_key: 'not-a-pem-key',
  client_email: 'test@example.com',
});
delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

import { getFirebaseMessaging } from './firebaseAdmin';

assert.doesNotThrow(() => getFirebaseMessaging());
assert.equal(getFirebaseMessaging(), null);
// Повторный вызов тоже безопасен и не пытается инициализироваться заново.
assert.equal(getFirebaseMessaging(), null);

console.log('firebaseAdmin.test OK');
process.exit(0);
