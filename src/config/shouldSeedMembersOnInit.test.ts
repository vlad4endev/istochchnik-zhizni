import assert from 'node:assert/strict';
import { shouldSeedMembersOnInit } from './memberSeedSql';

assert.equal(shouldSeedMembersOnInit({}), false);
assert.equal(shouldSeedMembersOnInit({ SEED_MEMBERS_ON_INIT: 'false' }), false);
assert.equal(shouldSeedMembersOnInit({ SEED_MEMBERS_ON_INIT: '1' }), false);
assert.equal(shouldSeedMembersOnInit({ SEED_MEMBERS_ON_INIT: 'true' }), true);

console.log('shouldSeedMembersOnInit.test OK');
process.exit(0);
