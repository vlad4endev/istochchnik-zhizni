import assert from 'node:assert/strict';
import { isParishionerAllowedPushKindOrType } from './parishionerPushAllowlist';

function run(): void {
  assert.equal(isParishionerAllowedPushKindOrType('prayer_reminder'), true);
  assert.equal(isParishionerAllowedPushKindOrType('birthday_today'), true);
  assert.equal(isParishionerAllowedPushKindOrType('new_sermon'), true);
  assert.equal(isParishionerAllowedPushKindOrType('broadcast'), true);
  assert.equal(isParishionerAllowedPushKindOrType('broadcast_start'), true);

  assert.equal(isParishionerAllowedPushKindOrType('coordinator_week_digest'), false);
  assert.equal(isParishionerAllowedPushKindOrType('media_assignment'), false);
  assert.equal(isParishionerAllowedPushKindOrType('music_reminder'), false);

  console.log('parishionerPushAllowlist.test.ts: OK');
}

run();
