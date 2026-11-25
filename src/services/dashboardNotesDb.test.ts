/**
 * Регресс на реальном Postgres (пропускается без DATABASE_URL):
 * start_date / end_date заметок координаторов приходят строкой YYYY-MM-DD,
 * а не «Sat Nov 21 2026 00:00:00 GMT…» (pg отдаёт DATE как Date).
 *
 *   DATABASE_URL=postgres://... npx ts-node --transpile-only src/services/dashboardNotesDb.test.ts
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { pool, query } from '../config/db';
import {
  getCoordinatorNotesManageSnapshot,
  getCoordinatorNotesVisibleOnDate,
} from './dashboardCoordinatorNotesService';

// Тест дропает схему public — только против отдельной scratch-БД и с явным согласием:
// ALLOW_DESTRUCTIVE_DB_TESTS=1 DATABASE_URL=postgres://.../scratch npm test
const hasDb =
  Boolean(process.env.DATABASE_URL) && process.env.ALLOW_DESTRUCTIVE_DB_TESTS === '1';
const suite = hasDb ? describe : describe.skip;

suite('coordinator notes dates (real Postgres)', () => {
  before(async () => {
    await query(`DROP SCHEMA public CASCADE`);
    await query(`CREATE SCHEMA public`);
    await query(`
      CREATE TABLE dashboard_coordinator_notes (
        kind TEXT PRIMARY KEY, body TEXT, start_date DATE, end_date DATE,
        updated_by_member_id INT, updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(
      `INSERT INTO dashboard_coordinator_notes (kind, body, start_date, end_date)
       VALUES ('urgent_prayer', 'Помолитесь', '2026-11-21', '2026-11-22')`,
    );
  });
  after(async () => {
    if (pool) await pool.end().catch(() => undefined);
  });

  it('visible notes return ISO dates', async () => {
    const data = await getCoordinatorNotesVisibleOnDate('2026-11-21');
    assert.deepEqual(data.urgent_prayer, {
      text: 'Помолитесь',
      start_date: '2026-11-21',
      end_date: '2026-11-22',
    });
  });

  it('manage snapshot returns ISO dates', async () => {
    const data = await getCoordinatorNotesManageSnapshot();
    assert.equal(data.urgent_prayer?.start_date, '2026-11-21');
    assert.equal(data.urgent_prayer?.end_date, '2026-11-22');
  });
});
