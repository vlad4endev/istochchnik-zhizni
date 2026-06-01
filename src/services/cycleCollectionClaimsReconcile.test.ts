import assert from 'node:assert/strict';

import { findNextUnassignedRosterMember } from './cycleCollectionClaimsService';

function run(): void {
  const roster = [10, 20, 30, 40];
  const claimed = new Set([10, 30]);

  assert.equal(findNextUnassignedRosterMember(roster, claimed, roster.indexOf(10)), 20);
  assert.equal(findNextUnassignedRosterMember(roster, claimed, roster.indexOf(30)), 40);
  assert.equal(findNextUnassignedRosterMember(roster, claimed, roster.indexOf(40)), 20);

  const full = new Set(roster);
  assert.equal(findNextUnassignedRosterMember(roster, full, 0), null);

  assert.equal(findNextUnassignedRosterMember(roster, new Set(), -1), 10);

  console.log('cycleCollectionClaimsReconcile.test.ts: OK');
}

run();
