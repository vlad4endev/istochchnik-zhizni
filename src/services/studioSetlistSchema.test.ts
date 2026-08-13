/**
 * Regression: under SKIP_DB_INIT, missing setlist columns must be self-healed
 * before list/items/performance queries (otherwise 500 in studio UI).
 *
 * Run with Postgres:
 *   node -r ts-node/register/transpile-only --test src/services/studioSetlistSchema.test.ts
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { pool, query } from '../config/db';
import {
  ensureSetlistSchema,
  listSetlistItems,
  listSetlists,
} from './studioService';

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

async function resetMinimalSchema(): Promise<void> {
  await query(`DROP SCHEMA public CASCADE`);
  await query(`CREATE SCHEMA public`);
  await query(`CREATE TABLE members (id SERIAL PRIMARY KEY, ministry_direction TEXT)`);
  await query(`
    CREATE TABLE songs (
      id BIGSERIAL PRIMARY KEY,
      song_number INT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      content TEXT,
      default_key TEXT,
      tempo INT,
      time_signature TEXT,
      tags TEXT[],
      is_published BOOLEAN DEFAULT true,
      created_by_member_id INT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Intentionally omit source_service_plan_id, musician_notes, sheet_* — prod SKIP_DB_INIT gap.
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
      position INTEGER NOT NULL,
      song_id BIGINT NOT NULL REFERENCES songs(id),
      studio_version_id BIGINT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE studio_versions (
      id BIGSERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES members(id),
      song_id BIGINT NOT NULL REFERENCES songs(id),
      custom_content TEXT,
      custom_key VARCHAR(32),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (member_id, song_id)
    )
  `);
  await query(`INSERT INTO members (id, ministry_direction) VALUES (1, 'Музыкальное служение')`);
  await query(
    `INSERT INTO songs (id, title, slug, content) VALUES (1, 'Test Song', 'test-song', E'C\\nHello')`,
  );
  await query(
    `INSERT INTO setlists (id, member_id, title, event_date) VALUES (9, 1, 'Sunday', CURRENT_DATE)`,
  );
  await query(`INSERT INTO setlist_items (setlist_id, position, song_id) VALUES (9, 0, 1)`);
}

suite('ensureSetlistSchema', () => {
  before(async () => {
    await resetMinimalSchema();
  });

  after(async () => {
    if (pool) await pool.end().catch(() => undefined);
  });

  it('heals missing columns and listSetlists succeeds', async () => {
    // Without heal this throws: column source_service_plan_id does not exist
    await ensureSetlistSchema();
    const cols = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'setlists'
        AND column_name = 'source_service_plan_id'
    `);
    assert.equal(cols.rowCount, 1);

    const rows = await listSetlists(1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.id, '9');
    assert.equal(rows[0]?.title, 'Sunday');
  });

  it('heals musician_notes/sheet columns and listSetlistItems succeeds', async () => {
    const items = await listSetlistItems(1, 9);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.song.title, 'Test Song');
    assert.equal(items[0]?.musician_notes.v, 1);

    const notesCol = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'setlist_items'
        AND column_name = 'musician_notes'
    `);
    assert.equal(notesCol.rowCount, 1);

    const sheetCols = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'studio_versions'
        AND column_name IN ('sheet_content', 'sheet_key', 'sheet_meta')
      ORDER BY 1
    `);
    assert.equal(sheetCols.rowCount, 3);
  });
});
