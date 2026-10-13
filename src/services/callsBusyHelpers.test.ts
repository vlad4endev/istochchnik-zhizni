import assert from 'node:assert/strict';

import { CallsError, isMemberBusyInCall } from './callsService';
import { livekitIdentityForMember } from './livekitService';

/**
 * Lightweight guards for multi-user call stability helpers.
 * Full DB busy races need integration env; here we pin identity + error contracts.
 */
async function main(): Promise<void> {
  assert.equal(livekitIdentityForMember(7), 'member:7');
  assert.equal(livekitIdentityForMember(1001), 'member:1001');

  const busy = new CallsError('already_in_call', 'Вы уже участвуете в другом звонке');
  assert.equal(busy.code, 'already_in_call');
  assert.ok(busy.message.includes('уже'));

  const full = new CallsError('full', 'Достигнут лимит участников');
  assert.equal(full.code, 'full');

  // Without DB, busy check should throw or return false depending on pool —
  // when DATABASE_URL is unset, query() typically fails; treat as non-busy only if query works.
  if (!process.env.DATABASE_URL) {
    try {
      await isMemberBusyInCall(1);
      // If somehow pool exists without DATABASE_URL in env visible here, still ok
    } catch {
      // Expected when DB is not configured in unit test env
    }
  }

  console.log('callsBusyHelpers ok');
}

void main();
