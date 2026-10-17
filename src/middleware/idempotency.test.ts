import assert from 'node:assert/strict';
import test from 'node:test';

import { isIdempotentRoute } from './idempotency';

test('идемпотентные маршруты: безопасные действия', () => {
  assert.equal(isIdempotentRoute('POST', '/api/calendar/prayer-need/submit'), true);
  assert.equal(isIdempotentRoute('patch', '/api/music-schedule/assignments/5/status'), true);
  assert.equal(isIdempotentRoute('POST', '/api/notifications/deliveries/open-all'), true);
});

test('идемпотентные маршруты: остальное не затрагивается', () => {
  assert.equal(isIdempotentRoute('POST', '/api/messenger/messages'), false);
  assert.equal(isIdempotentRoute('GET', '/api/calendar/prayer-need/submit'), false);
  assert.equal(isIdempotentRoute('DELETE', '/api/posts/3'), false);
});
