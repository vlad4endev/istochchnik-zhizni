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

// Без ключа и без FIREBASE_USE_ADC клиент не создаётся «по умолчанию» (раньше это давало ложное «FCM настроен»).
// Модуль держит состояние инициализации, поэтому проверяем в отдельном процессе.
import { spawnSync } from 'node:child_process';

const child = spawnSync(
  process.execPath,
  [
    '-r',
    'ts-node/register/transpile-only',
    '-e',
    "delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON; delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH; delete process.env.GOOGLE_APPLICATION_CREDENTIALS; delete process.env.FIREBASE_USE_ADC; const m = require('./src/config/firebaseAdmin'); if (m.getFirebaseMessaging() !== null) { console.error('expected null'); process.exit(1); }",
  ],
  { cwd: process.cwd(), encoding: 'utf8' },
);
assert.equal(child.status, 0, child.stderr);

console.log('firebaseAdmin.test OK');
process.exit(0);
