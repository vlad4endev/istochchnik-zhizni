import assert from 'node:assert/strict';

import { redactEditToken, redactEditTokens } from './planTokenAccess';

const plan = { id: 1, share_token: 'SHARE', edit_token: 'EDIT-SECRET', blocks_count: 3 };

// Редактор получает план как есть.
assert.deepEqual(redactEditToken(plan, true), plan);
assert.equal(redactEditToken(plan, true).edit_token, 'EDIT-SECRET');

// Остальные: токена редактирования нет, всё прочее на месте (ссылка для чтения нужна приложению и сайту).
const hidden = redactEditToken(plan, false);
assert.equal(hidden.edit_token, '');
assert.equal(hidden.share_token, 'SHARE');
assert.equal(hidden.id, 1);
assert.equal(hidden.blocks_count, 3);
assert.deepEqual(Object.keys(hidden).sort(), Object.keys(plan).sort(), 'набор полей не меняется');

// Исходный объект не мутируется.
assert.equal(plan.edit_token, 'EDIT-SECRET');

// Списки.
const list = [plan, { ...plan, id: 2, edit_token: 'EDIT-2' }];
assert.deepEqual(redactEditTokens(list, true), list);
assert.deepEqual(
  redactEditTokens(list, false).map((p) => p.edit_token),
  ['', ''],
);
assert.equal(list[1]!.edit_token, 'EDIT-2');
assert.deepEqual(redactEditTokens([], false), []);

console.log('planTokenAccess.test.ts: OK');
