import assert from 'node:assert/strict';

process.env.VAPID_PUBLIC_KEY = 'pub-key';
process.env.VAPID_PRIVATE_KEY = 'priv-key';
process.env.VAPID_SUBJECT = 'admin@church.example';

import { getVapidConfig, getVapidPublicKeyValue, initVapidKeys } from './vapidKeys';

async function run(): Promise<void> {
  // Ключи из окружения имеют приоритет; голый e-mail нормализуется в mailto:.
  const cfg = await initVapidKeys();
  assert.equal(cfg?.source, 'env');
  assert.equal(cfg?.subject, 'mailto:admin@church.example');
  assert.equal(getVapidPublicKeyValue(), 'pub-key');

  // Нет subject — подставляется запасной, ключи остаются рабочими (раньше push отключался целиком).
  delete process.env.VAPID_SUBJECT;
  process.env.PUBLIC_WEB_ORIGIN = 'https://app.example.org/';
  const noSubject = await initVapidKeys();
  assert.equal(noSubject?.subject, 'https://app.example.org');
  assert.equal(getVapidConfig()?.privateKey, 'priv-key');

  console.log('vapidKeys.test OK');
}

run().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
