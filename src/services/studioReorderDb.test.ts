/**
 * Регресс на реальном Postgres (пропускается без DATABASE_URL):
 *  - reorderSetlistItems не падает на UNIQUE (setlist_id, position) при переносе вверх;
 *  - устаревший/неполный список от клиента не ломает порядок (нет дублей позиций);
 *  - event_date из колонки DATE приходит строкой YYYY-MM-DD.
 *
 *   DATABASE_URL=postgres://... npx ts-node --transpile-only src/services/studioReorderDb.test.ts
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { pool, query } from '../config/db';
import { listSetlists, reorderSetlistItems } from './studioService';

// Тест дропает схему public — только против отдельной scratch-БД и с явным согласием:
// ALLOW_DESTRUCTIVE_DB_TESTS=1 DATABASE_URL=postgres://.../scratch npm test
const hasDb =
  Boolean(process.env.DATABASE_URL) && process.env.ALLOW_DESTRUCTIVE_DB_TESTS === '1';
const suite = hasDb ? describe : describe.skip;

async function resetSchema(): Promise<void> {
  await query(`DROP SCHEMA public CASCADE`);
  await query(`CREATE SCHEMA public`);
  await query(`CREATE TABLE members (id SERIAL PRIMARY KEY, ministry_direction TEXT)`);
  await query(`
    CREATE TABLE songs (
      id BIGSERIAL PRIMARY KEY, song_number INT, title TEXT NOT NULL, slug TEXT NOT NULL,
      content TEXT, default_key TEXT, tempo INT, time_signature TEXT, tags TEXT[],
      is_published BOOLEAN DEFAULT true, created_by_member_id INT,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE setlists (
      id BIGSERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES members(id),
      title VARCHAR(500) NOT NULL,
      event_date DATE,
      is_public BOOLEAN NOT NULL DEFAULT FALSE,
      share_token UUID UNIQUE DEFAULT gen_random_uuid(),
      share_token_issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE setlist_items (
      id BIGSERIAL PRIMARY KEY,
      setlist_id BIGINT NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
      position INTEGER NOT NULL CHECK (position >= 0),
      song_id BIGINT NOT NULL REFERENCES songs(id),
      studio_version_id BIGINT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (setlist_id, "position")
    )
  `);
  await query(`INSERT INTO members (id, ministry_direction) VALUES (1, 'Музыкальное служение'), (2, NULL)`);
  await query(`INSERT INTO songs (id, title, slug) VALUES (1, 'A', 'a')`);
  await query(`INSERT INTO setlists (id, member_id, title, event_date) VALUES (9, 1, 'Sunday', '2026-11-22')`);
  for (let i = 0; i < 5; i += 1) {
    await query(`INSERT INTO setlist_items (id, setlist_id, position, song_id) VALUES ($1, 9, $2, 1)`, [i + 1, i]);
  }
}

async function order(): Promise<number[]> {
  const r = await query(`SELECT id FROM setlist_items WHERE setlist_id = 9 ORDER BY position`);
  return r.rows.map((x: { id: string }) => Number(x.id));
}

async function positions(): Promise<number[]> {
  const r = await query(`SELECT position FROM setlist_items WHERE setlist_id = 9 ORDER BY position`);
  return r.rows.map((x: { position: number }) => Number(x.position));
}

suite('reorderSetlistItems / event_date (real Postgres)', () => {
  before(resetSchema);
  after(async () => {
    if (pool) await pool.end().catch(() => undefined);
  });

  it('listSetlists returns event_date as YYYY-MM-DD', async () => {
    const rows = await listSetlists(1);
    assert.equal(rows[0]?.event_date, '2026-11-22');
  });

  it('moves an item up without violating the unique position constraint', async () => {
    await reorderSetlistItems(1, 9, [5, 1, 2, 3, 4]);
    assert.deepEqual(await order(), [5, 1, 2, 3, 4]);
    assert.deepEqual(await positions(), [0, 1, 2, 3, 4]);
  });

  it('keeps unknown items at the end when the client list is stale', async () => {
    await reorderSetlistItems(1, 9, [4, 5]);
    assert.deepEqual(await order(), [4, 5, 1, 2, 3]);
    assert.deepEqual(await positions(), [0, 1, 2, 3, 4]);
  });

  it('ignores foreign and duplicate ids', async () => {
    await reorderSetlistItems(1, 9, [3, 3, 999, 2]);
    assert.deepEqual(await order(), [3, 2, 4, 5, 1]);
    assert.deepEqual(await positions(), [0, 1, 2, 3, 4]);
  });

  it('rejects a foreign member', async () => {
    await assert.rejects(() => reorderSetlistItems(2, 9, [1, 2, 3, 4, 5]), /setlist not found/);
    assert.deepEqual(await positions(), [0, 1, 2, 3, 4]);
  });
});
