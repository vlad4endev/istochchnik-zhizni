import assert from 'node:assert/strict';

import { EnsuredRooms, RoomServiceTimeoutError, UrlHealth, withTimeout } from './livekitReachability';
import { supersedeOwnAbandonedCalls } from './callsService';

async function main(): Promise<void> {
  // withTimeout: быстрый успех, ошибка, таймаут
  assert.equal(await withTimeout(Promise.resolve(7), 200, 't'), 7);
  await assert.rejects(withTimeout(Promise.reject(new Error('boom')), 200, 't'), /boom/);
  const slow = new Promise<number>((r) => setTimeout(() => r(1), 400));
  const started = Date.now();
  await assert.rejects(withTimeout(slow, 50, 'slow'), (e: unknown) => {
    assert.ok(e instanceof RoomServiceTimeoutError);
    assert.match((e as Error).message, /ETIMEDOUT/);
    return true;
  });
  assert.ok(Date.now() - started < 300, 'таймаут не должен ждать медленный запрос');

  // UrlHealth: упавший адрес уходит в конец, через cooldown возвращается
  let now = 1000;
  const health = new UrlHealth(60_000, () => now);
  const urls = ['a', 'b', 'c'];
  assert.deepEqual(health.order(urls), ['a', 'b', 'c']);
  health.markFailed('a');
  assert.deepEqual(health.order(urls), ['b', 'c', 'a']);
  now += 59_999;
  assert.deepEqual(health.order(urls), ['b', 'c', 'a']);
  now += 2;
  assert.deepEqual(health.order(urls), ['a', 'b', 'c']);
  health.markFailed('b');
  health.markOk('b');
  assert.deepEqual(health.order(urls), ['a', 'b', 'c']);

  // EnsuredRooms
  let t = 0;
  const rooms = new EnsuredRooms(1000, 100, () => t);
  assert.equal(rooms.shouldSkip('r'), false);
  rooms.markOk('r');
  assert.equal(rooms.shouldSkip('r'), true);
  t = 1001;
  assert.equal(rooms.shouldSkip('r'), false);
  rooms.markFailed('x');
  assert.equal(rooms.shouldSkip('x'), true);
  t = 1200;
  assert.equal(rooms.shouldSkip('x'), false);

  // supersedeOwnAbandonedCalls: порядок запросов и результат
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const fake = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      if (/UPDATE calls/.test(sql)) {
        return { rows: [{ id: 'c1', livekit_room_name: 'meet_1' }, { id: 'c2', livekit_room_name: null }] };
      }
      return { rows: [] };
    },
  };
  const rn = await supersedeOwnAbandonedCalls(fake as never, 5);
  assert.deepEqual(rn, ['meet_1']);
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /status = 'waiting'/);
  assert.match(calls[0].sql, /o\.user_id <> \$1/);
  assert.deepEqual(calls[0].params, [5]);
  assert.deepEqual(calls[1].params, [['c1', 'c2']]);

  const none = await supersedeOwnAbandonedCalls({ query: async () => ({ rows: [] }) } as never, 5);
  assert.deepEqual(none, []);

  console.log('livekitReachability ok');
  process.exit(0);
}

void main();
