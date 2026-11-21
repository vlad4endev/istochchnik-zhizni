import assert from 'node:assert/strict';

import { mergeReorder, toYmd } from './studioSetlistLogic';

// toYmd: Date из node-postgres (локальная полночь) → календарная дата без сдвига
assert.equal(toYmd(new Date(2026, 10, 22)), '2026-11-22');
assert.equal(toYmd(new Date(2026, 0, 1)), '2026-01-01');
assert.equal(toYmd(new Date(2026, 11, 31)), '2026-12-31');
assert.equal(toYmd('2026-11-22'), '2026-11-22');
assert.equal(toYmd('2026-11-22T00:00:00.000Z'), '2026-11-22');
assert.equal(toYmd(null), null);
assert.equal(toYmd(undefined), null);
assert.equal(toYmd(new Date('invalid')), null);
assert.equal(toYmd('Sun Nov 22'), null);

// mergeReorder
assert.deepEqual(mergeReorder([1, 2, 3], [3, 1, 2]), [3, 1, 2]);
// клиент не знал про элемент 4 → он остаётся в конце
assert.deepEqual(mergeReorder([1, 2, 3, 4], [3, 1, 2]), [3, 1, 2, 4]);
// чужие/удалённые id и дубли игнорируются
assert.deepEqual(mergeReorder([1, 2, 3], [9, 3, 3, 1, 7]), [3, 1, 2]);
// пустой запрос → прежний порядок
assert.deepEqual(mergeReorder([5, 6], []), [5, 6]);
assert.deepEqual(mergeReorder([], [1, 2]), []);

console.log('studioSetlistLogic ok');
