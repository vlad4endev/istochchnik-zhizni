import assert from 'node:assert/strict';

import { parsePositiveMemberIds } from '../utils/parsePositiveMemberIds';

function main(): void {
  assert.deepEqual(parsePositiveMemberIds([1, 2, 3]), [1, 2, 3]);
  assert.deepEqual(parsePositiveMemberIds(['10', '20', '30']), [10, 20, 30]);
  assert.deepEqual(
    parsePositiveMemberIds([1, '1', 0, -5, 'x', null, undefined, 2.9, ' 3 ']),
    [1, 2, 3],
  );
  assert.deepEqual(parsePositiveMemberIds(undefined), []);
  assert.deepEqual(parsePositiveMemberIds(null), []);
  assert.deepEqual(parsePositiveMemberIds({ 0: 1 }), []);
  console.log('messengerGroupCreate (unit) ok');
}

main();
