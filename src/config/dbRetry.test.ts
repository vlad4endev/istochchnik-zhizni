import assert from 'node:assert/strict';

import { isRetryableReadOnlyQuery } from './db';

// Чтение — повторяем после обрыва соединения.
assert.equal(isRetryableReadOnlyQuery('SELECT 1'), true);
assert.equal(isRetryableReadOnlyQuery('  \n select * from members where id = $1'), true);
assert.equal(isRetryableReadOnlyQuery('SHOW server_version'), true);
assert.equal(isRetryableReadOnlyQuery('WITH t AS (SELECT 1) SELECT * FROM t'), true);

// Запись — не повторяем: после обрыва запрос мог уже примениться.
assert.equal(isRetryableReadOnlyQuery('INSERT INTO members (name) VALUES ($1)'), false);
assert.equal(isRetryableReadOnlyQuery('UPDATE members SET name = $1 WHERE id = $2'), false);
assert.equal(isRetryableReadOnlyQuery('DELETE FROM app_logs'), false);
assert.equal(isRetryableReadOnlyQuery('WITH d AS (DELETE FROM a RETURNING *) SELECT * FROM d'), false);
assert.equal(isRetryableReadOnlyQuery('WITH i AS (INSERT INTO a VALUES (1) RETURNING id) SELECT * FROM i'), false);
assert.equal(isRetryableReadOnlyQuery('CREATE TABLE x (id int)'), false);
assert.equal(isRetryableReadOnlyQuery(''), false);

console.log('dbRetry.test.ts: OK');
