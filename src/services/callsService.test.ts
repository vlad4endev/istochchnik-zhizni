import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'crypto';

import {
  CallsError,
  defaultCallTitle,
  normalizeCallTitle,
  parseCallMetadata,
  titleFromCallMetadata,
} from './callsService';

function hashInviteToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

async function main(): Promise<void> {
  const err = new CallsError('busy', 'Абонент занят');
  assert.equal(err.code, 'busy');
  assert.equal(err.message, 'Абонент занят');
  assert.ok(err instanceof Error);

  const raw = randomBytes(32).toString('base64url');
  assert.ok(raw.length >= 32);
  const h1 = hashInviteToken(raw);
  const h2 = hashInviteToken(raw);
  assert.equal(h1, h2);
  assert.notEqual(h1, hashInviteToken(raw + 'x'));
  assert.equal(h1.length, 64);

  // Opaque invite must not equal call UUID alone
  const callId = '11111111-1111-1111-1111-111111111111';
  assert.notEqual(hashInviteToken(callId), callId);

  assert.equal(defaultCallTitle('video', true), 'Видеовстреча');
  assert.equal(defaultCallTitle('audio', false), 'Аудиоконференция');
  assert.equal(normalizeCallTitle('  Молитва   вечера  ', 'video', true), 'Молитва вечера');
  assert.equal(normalizeCallTitle('', 'audio', true), 'Аудиовстреча');
  assert.equal(normalizeCallTitle('x'.repeat(100), 'video', true).length, 80);

  assert.deepEqual(parseCallMetadata({ title: 'Вечерняя молитвенная стража', standalone: true }), {
    title: 'Вечерняя молитвенная стража',
    standalone: true,
  });
  assert.deepEqual(
    parseCallMetadata('{"title":"Утренняя молитвенная стража","standalone":true}'),
    { title: 'Утренняя молитвенная стража', standalone: true },
  );
  assert.deepEqual(parseCallMetadata('not-json'), {});
  assert.equal(
    titleFromCallMetadata({ title: '  Вечерняя молитвенная стража  ' }),
    'Вечерняя молитвенная стража',
  );
  assert.equal(
    titleFromCallMetadata('{"title":"Моя встреча"}'),
    'Моя встреча',
  );
  assert.equal(titleFromCallMetadata({}), null);

  console.log('callsService (unit) ok');
}

void main();
