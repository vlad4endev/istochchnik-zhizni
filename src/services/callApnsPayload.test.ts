import assert from 'node:assert/strict';

import { buildCallApnsConfig } from './callApnsPayload';

const base = { title: 'Входящий видеозвонок', body: 'Иван', ttlSec: 60, nowSec: 1_000 };

// VoIP не доставлен: обычный баннер со звуком, как раньше
const loud = buildCallApnsConfig({ ...base, type: 'incoming_call', iosSilent: false });
assert.equal(loud.headers['apns-push-type'], 'alert');
assert.equal(loud.headers['apns-priority'], '10');
assert.equal(loud.headers['apns-expiration'], '1060');
assert.deepEqual(loud.payload.aps.alert, { title: 'Входящий видеозвонок', body: 'Иван' });
assert.equal(loud.payload.aps.sound, 'default');
assert.equal(loud.payload.aps.category, 'INCOMING_CALL');

// VoIP доставлен: тихий фоновый пуш без баннера и звука (звонит CallKit)
const quiet = buildCallApnsConfig({ ...base, type: 'incoming_call', iosSilent: true });
assert.equal(quiet.headers['apns-push-type'], 'background');
assert.equal(quiet.headers['apns-priority'], '5');
assert.deepEqual(quiet.payload.aps, { contentAvailable: true });
assert.equal('alert' in quiet.payload.aps, false);
assert.equal('sound' in quiet.payload.aps, false);

// «Звонок завершён» никогда не показывает баннер, даже если VoIP не использовался
for (const iosSilent of [true, false]) {
  const ended = buildCallApnsConfig({ ...base, title: '', body: '', type: 'call_ended', iosSilent });
  assert.equal(ended.payload.aps.alert, undefined);
  assert.equal(ended.payload.aps.sound, undefined);
  assert.equal(ended.payload.aps.category, undefined);
}
// «Тихий» режим не влияет на не-звонки: остаётся обычная конфигурация
assert.equal(buildCallApnsConfig({ ...base, type: 'call_ended', iosSilent: true }).headers['apns-push-type'], 'alert');

console.log('callApnsPayload ok');
