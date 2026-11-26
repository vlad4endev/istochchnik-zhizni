import assert from 'node:assert/strict';

import { isRetryableWebPushNetworkError, webPushRetryDelayMs, webPushRetryMaxAttempts } from './webPushRetry';

async function run(): Promise<void> {
  // 429: пауза строго из Retry-After (RFC 8030), он перекрывает экспоненциальную паузу.
  assert.equal(webPushRetryDelayMs({ statusCode: 429, headers: { 'retry-after': '5' } }, 1), 5_000);
  // Retry-After ограничен сверху, чтобы запрос не завис на минуты в цикле отправки.
  assert.equal(webPushRetryDelayMs({ statusCode: 429, headers: { 'retry-after': '999' } }, 1), 30_000);
  // Некорректный Retry-After — игнорируем, пауза из экспоненты.
  const badHeader = webPushRetryDelayMs({ statusCode: 429, headers: { 'retry-after': 'garbage' } }, 1);
  assert.ok(badHeader != null && badHeader >= 400 && badHeader <= 600);

  // 5xx: ретрай с базовой паузой ±20% джиттера.
  const d1 = webPushRetryDelayMs({ statusCode: 503 }, 1);
  assert.ok(d1 != null && d1 >= 400 && d1 <= 600, `attempt 1 delay ${d1}`);
  const d2 = webPushRetryDelayMs({ statusCode: 502 }, 2);
  assert.ok(d2 != null && d2 >= 1600 && d2 <= 2400, `attempt 2 delay ${d2}`);

  // Фатальные статусы — не ретраим: подписка мертва (404/410) или ключ/VAPID (400/401/403).
  assert.equal(webPushRetryDelayMs({ statusCode: 404 }, 1), null);
  assert.equal(webPushRetryDelayMs({ statusCode: 410 }, 1), null);
  assert.equal(webPushRetryDelayMs({ statusCode: 400, body: 'VapidPkHashMismatch' }, 1), null);
  assert.equal(webPushRetryDelayMs({ statusCode: 401 }, 1), null);

  // Сетевые обрывы — ретраим.
  assert.ok(webPushRetryDelayMs(Object.assign(new Error('socket hang up'), { code: 'ETIMEDOUT' }), 1) != null);
  assert.ok(webPushRetryDelayMs(Object.assign(new Error('x'), { code: 'ECONNRESET' }), 2) != null);
  assert.ok(
    isRetryableWebPushNetworkError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })),
  );
  assert.ok(
    isRetryableWebPushNetworkError(new Error('request timeout after 25000ms')),
  );

  // Ошибка без статуса и без сетевого кода — не ретраим (валидационная ошибка библиотеки).
  assert.equal(webPushRetryDelayMs(new Error('The first argument must be of type string'), 1), null);

  // Всего 4 попытки (исходная + 3 ретрая) — на последней вызывающий код не ретраит.
  assert.equal(webPushRetryMaxAttempts(), 4);

  console.log('webPushRetry.test OK');
}

run().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
