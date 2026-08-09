import { query } from '../config/db';

export interface StudioSongTag {
  id: string;
  name: string;
  song_count: number;
  created_at: string;
  updated_at: string;
}

/** System / sandbox tags that must not appear in the managed catalog. */
const SYSTEM_TAG_LOWER = new Set(['импортированная', 'импортировано', 'нет_текста', '__archived']);

const TAG_NAME_MAX = 80;

let schemaReady = false;

/** Self-heal: create catalog table if deploy skipped migration / old initDb. */
export async function ensureStudioSongTagsSchema(): Promise<void> {
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS studio_song_tags (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(${TAG_NAME_MAX}) NOT NULL,
      created_by_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS studio_song_tags_name_lower_uidx
      ON studio_song_tags (LOWER(TRIM(name)))
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_studio_song_tags_name ON studio_song_tags (name)
  `);
  schemaReady = true;
}

export function isManagedSongTagName(raw: string): boolean {
  const name = raw.trim();
  if (!name) return false;
  if (name.length > TAG_NAME_MAX) return false;
  if (name.startsWith('__')) return false;
  if (SYSTEM_TAG_LOWER.has(name.toLowerCase())) return false;
  return true;
}

export function normalizeTagName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name || name.length > TAG_NAME_MAX) return null;
  if (!isManagedSongTagName(name)) return null;
  return name;
}

function mapRow(row: Record<string, unknown>): StudioSongTag {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    song_count: Number(row.song_count ?? 0),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

const LIST_SQL = `
  SELECT
    t.id,
    t.name,
    t.created_at,
    t.updated_at,
    COALESCE((
      SELECT COUNT(*)::int
      FROM songs s
      WHERE s.tags && ARRAY[t.name]::text[]
    ), 0) AS song_count
  FROM studio_song_tags t
`;

/** Pull distinct user tags from songs into the catalog (idempotent). */
export async function syncSongTagsFromSongs(): Promise<number> {
  await ensureStudioSongTagsSchema();
  const r = await query(
    `INSERT INTO studio_song_tags (name)
     SELECT DISTINCT LEFT(TRIM(x.tag), ${TAG_NAME_MAX})
     FROM songs s
     CROSS JOIN LATERAL unnest(COALESCE(s.tags, '{}'::text[])) AS x(tag)
     WHERE TRIM(x.tag) <> ''
       AND char_length(TRIM(x.tag)) <= ${TAG_NAME_MAX}
       AND TRIM(x.tag) NOT LIKE '\\_\\_%' ESCAPE '\\'
       AND LOWER(TRIM(x.tag)) NOT IN ('импортированная', 'импортировано', 'нет_текста')
     ON CONFLICT ((LOWER(TRIM(name)))) DO NOTHING`,
  );
  return r.rowCount ?? 0;
}

export async function listStudioSongTags(): Promise<StudioSongTag[]> {
  await ensureStudioSongTagsSchema();
  try {
    await syncSongTagsFromSongs();
  } catch (e) {
    // Listing must still work even if seed/sync fails (bad legacy tags, etc.).
    console.error('[studio-song-tags] sync from songs failed:', e);
  }
  const r = await query(`${LIST_SQL} ORDER BY LOWER(t.name) ASC`);
  return r.rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function createStudioSongTag(
  rawName: string,
  memberId: number | null,
): Promise<StudioSongTag> {
  await ensureStudioSongTagsSchema();
  const name = normalizeTagName(rawName);
  if (!name) {
    throw Object.assign(new Error('invalid_name'), { code: 'invalid_name' });
  }

  try {
    const inserted = await query(
      `INSERT INTO studio_song_tags (name, created_by_member_id)
       VALUES ($1, $2)
       RETURNING id`,
      [name, memberId],
    );
    const id = String((inserted.rows[0] as { id: string }).id);
    const listed = await query(`${LIST_SQL} WHERE t.id = $1`, [id]);
    return mapRow(listed.rows[0] as Record<string, unknown>);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === '23505') {
      throw Object.assign(new Error('duplicate'), { code: 'duplicate' });
    }
    throw e;
  }
}

export async function renameStudioSongTag(
  id: number,
  rawName: string,
): Promise<StudioSongTag | null> {
  await ensureStudioSongTagsSchema();
  const name = normalizeTagName(rawName);
  if (!name) {
    throw Object.assign(new Error('invalid_name'), { code: 'invalid_name' });
  }

  const existing = await query(`SELECT id, name FROM studio_song_tags WHERE id = $1`, [id]);
  const row = existing.rows[0] as { id: string; name: string } | undefined;
  if (!row) return null;

  const oldName = row.name;
  if (oldName === name) {
    const listed = await query(`${LIST_SQL} WHERE t.id = $1`, [id]);
    return mapRow(listed.rows[0] as Record<string, unknown>);
  }

  try {
    await query(
      `UPDATE studio_song_tags SET name = $2, updated_at = NOW() WHERE id = $1`,
      [id, name],
    );
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === '23505') {
      throw Object.assign(new Error('duplicate'), { code: 'duplicate' });
    }
    throw e;
  }

  // Keep songs.tags in sync with the renamed catalog entry.
  await query(
    `UPDATE songs s
     SET tags = (
       SELECT ARRAY(
         SELECT DISTINCT CASE WHEN x = $1 THEN $2 ELSE x END
         FROM unnest(COALESCE(s.tags, '{}'::text[])) AS x
       )
     ),
     updated_at = NOW()
     WHERE s.tags && ARRAY[$1]::text[]`,
    [oldName, name],
  );

  const listed = await query(`${LIST_SQL} WHERE t.id = $1`, [id]);
  return mapRow(listed.rows[0] as Record<string, unknown>);
}

export async function deleteStudioSongTag(
  id: number,
  removeFromSongs: boolean,
): Promise<{ deleted: true; name: string; songsUpdated: number } | null> {
  await ensureStudioSongTagsSchema();
  const existing = await query(`SELECT id, name FROM studio_song_tags WHERE id = $1`, [id]);
  const row = existing.rows[0] as { id: string; name: string } | undefined;
  if (!row) return null;

  let songsUpdated = 0;
  if (removeFromSongs) {
    const upd = await query(
      `UPDATE songs s
       SET tags = COALESCE((
         SELECT ARRAY(SELECT x FROM unnest(COALESCE(s.tags, '{}'::text[])) AS x WHERE x <> $1)
       ), '{}'::text[]),
       updated_at = NOW()
       WHERE s.tags && ARRAY[$1]::text[]`,
      [row.name],
    );
    songsUpdated = upd.rowCount ?? 0;
  }

  await query(`DELETE FROM studio_song_tags WHERE id = $1`, [id]);
  return { deleted: true, name: row.name, songsUpdated };
}

/** Ensure tag names exist in the catalog when attaching to a song. */
export async function ensureStudioSongTags(
  names: string[],
  memberId: number | null,
): Promise<string[]> {
  await ensureStudioSongTagsSchema();
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = normalizeTagName(raw);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(name);
  }

  for (const name of normalized) {
    await query(
      `INSERT INTO studio_song_tags (name, created_by_member_id)
       VALUES ($1, $2)
       ON CONFLICT ((LOWER(TRIM(name)))) DO NOTHING`,
      [name, memberId],
    );
  }
  return normalized;
}
