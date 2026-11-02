import assert from 'node:assert/strict';
import { MEMBER_SEED_SQL, shouldSeedMembersOnInit } from './memberSeedSql';

assert.equal(shouldSeedMembersOnInit({}), false);
assert.equal(shouldSeedMembersOnInit({ SEED_MEMBERS_ON_INIT: 'true' }), false);
assert.match(MEMBER_SEED_SQL, /WHERE FALSE/i);

console.log('shouldSeedMembersOnInit.test OK');
process.exit(0);
