import assert from 'node:assert/strict';
import {
  isPublicUserId,
  normalizePublicUserId,
  parseMemberNumericId,
  parseMemberRef,
} from './memberIdentity';

function run(): void {
  assert.equal(isPublicUserId('550e8400-e29b-41d4-a716-446655440000'), true);
  assert.equal(isPublicUserId('550E8400-E29B-41D4-A716-446655440000'), true);
  assert.equal(isPublicUserId('not-a-uuid'), false);
  assert.equal(isPublicUserId('12'), false);
  assert.equal(isPublicUserId(''), false);
  assert.equal(isPublicUserId(null), false);

  assert.equal(parseMemberNumericId('42'), 42);
  assert.equal(parseMemberNumericId(7), 7);
  assert.equal(parseMemberNumericId('0'), null);
  assert.equal(parseMemberNumericId('-1'), null);
  assert.equal(parseMemberNumericId('550e8400-e29b-41d4-a716-446655440000'), null);

  assert.deepEqual(parseMemberRef('15'), { kind: 'numeric_id', id: 15 });
  assert.deepEqual(parseMemberRef('550e8400-e29b-41d4-a716-446655440000'), {
    kind: 'public_user_id',
    userId: '550e8400-e29b-41d4-a716-446655440000',
  });
  assert.deepEqual(parseMemberRef('550E8400-E29B-41D4-A716-446655440000'), {
    kind: 'public_user_id',
    userId: '550e8400-e29b-41d4-a716-446655440000',
  });
  assert.equal(parseMemberRef('abc'), null);

  assert.equal(
    normalizePublicUserId(' 550E8400-E29B-41D4-A716-446655440000 '),
    '550e8400-e29b-41d4-a716-446655440000',
  );
  assert.equal(normalizePublicUserId('bad'), null);

  console.log('memberIdentity.test.ts: OK');
}

run();
