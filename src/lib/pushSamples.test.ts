import assert from 'node:assert/strict';
import test from 'node:test';

import { PUSH_SAMPLES, findPushSample } from './pushSamples';

test('у каждого примера есть название, текст, путь и тип; идентификаторы уникальны', () => {
  const ids = new Set<string>();
  for (const s of PUSH_SAMPLES) {
    assert.ok(s.title.length > 0 && s.body.length > 0, s.id);
    assert.ok(s.data.url?.startsWith('/'), `${s.id}: url`);
    assert.ok(s.data.type, `${s.id}: type`);
    assert.equal(ids.has(s.id), false, `дубль ${s.id}`);
    ids.add(s.id);
  }
});

test('покрыты напоминания из правил: молитва, дни рождения, трансляция, проповедь, событие, кураторы, лента', () => {
  for (const id of ['prayer_reminder', 'birthday_today', 'broadcast_start', 'new_sermon', 'new_event', 'coordinator_week_digest', 'feed_new_post']) {
    assert.ok(findPushSample(id), id);
  }
});

test('неизвестный или не строковый идентификатор не находится', () => {
  assert.equal(findPushSample('nope'), undefined);
  assert.equal(findPushSample(42), undefined);
  assert.equal(findPushSample(undefined), undefined);
});
