import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'crypto';

import { CallsError } from './callsService';

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

  console.log('callsService (unit) ok');
}

void main();
