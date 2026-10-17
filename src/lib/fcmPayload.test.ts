import assert from 'node:assert/strict';

import { fitFcmPayload } from './fcmPayload';

function run(): void {
  // Короткое сообщение не меняется.
  const small = fitFcmPayload('Привет', 'Как дела?', { title: 'Привет', body: 'Как дела?', tag: 'chat-1' });
  assert.equal(small.body, 'Как дела?');
  assert.equal(small.data.tag, 'chat-1');

  // Длинное сообщение с тяжёлыми полями укладывается в лимит FCM (4096 байт) и сохраняет tag/url.
  const long = 'я'.repeat(6000);
  const fitted = fitFcmPayload('Чат', long, {
    title: 'Чат',
    body: long,
    tag: 'chat-7',
    url: '/messenger?c=7',
    image: 'x'.repeat(2000),
  });
  assert.ok(Buffer.byteLength(JSON.stringify(fitted.data), 'utf8') < 4096);
  assert.ok(fitted.body.length < long.length);
  assert.equal(fitted.data.body, fitted.body);
  assert.equal(fitted.data.tag, 'chat-7');
  assert.equal(fitted.data.url, '/messenger?c=7');
  assert.equal(fitted.data.image, undefined);
}

run();
console.log('fcmPayload.test OK');
