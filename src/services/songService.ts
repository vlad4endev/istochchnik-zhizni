import { query } from '../config/db';

export interface SongRow {
  id: string;
  song_number: number | null;
  title: string;
  slug: string;
  content: string;
  default_key: string | null;
  tempo: number | null;
  time_signature: string | null;
  tags: string[];
  is_published: boolean;
  created_by_member_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface SongListItem extends SongRow {
  has_studio_version?: boolean;
  is_favorite?: boolean;
}

function mapSong(r: Record<string, unknown>): SongRow {
  const rawTags = r.tags;
  let tags: string[] = [];
  if (Array.isArray(rawTags)) {
    tags = rawTags.map((t) => String(t));
  }
  return {
    id: String(r.id),
    song_number: r.song_number != null ? Number(r.song_number) : null,
    title: String(r.title),
    slug: String(r.slug),
    content: String(r.content ?? ''),
    default_key: r.default_key != null ? String(r.default_key) : null,
    tempo: r.tempo != null ? Number(r.tempo) : null,
    time_signature: r.time_signature != null ? String(r.time_signature) : null,
    tags,
    is_published: Boolean(r.is_published),
    created_by_member_id:
      r.created_by_member_id != null ? Number(r.created_by_member_id) : null,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

export function slugifyTitle(title: string): string {
  const t = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
  return t || 'pesnya';
}

export interface SongListFilters {
  q?: string;
  tempoMin?: number;
  tempoMax?: number;
  key?: string;
  /** любой из перечисленных тегов */
  tags?: string[];
}

export async function listPublishedSongs(
  memberId: number | null,
  filters?: SongListFilters
): Promise<SongListItem[]> {
  const f = filters ?? {};
  const search = (f.q ?? '').trim();
  const keyFilter = (f.key ?? '').trim();
  const hasTempoMin = f.tempoMin != null && Number.isFinite(f.tempoMin);
  const hasTempoMax = f.tempoMax != null && Number.isFinite(f.tempoMax);
  const tagList = (f.tags ?? []).map((t) => t.trim()).filter(Boolean);

  const conditions: string[] = ['s.is_published = TRUE'];
  const params: unknown[] = [];

  if (search.length > 0) {
    params.push(search);
    conditions.push(
      `to_tsvector('simple', coalesce(s.title, '') || ' ' || coalesce(s.content, '')) @@ plainto_tsquery('simple', $${params.length})`
    );
  }
  if (keyFilter.length > 0) {
    params.push(keyFilter);
    conditions.push(`LOWER(TRIM(s.default_key)) = LOWER($${params.length})`);
  }
  if (hasTempoMin) {
    params.push(f.tempoMin!);
    conditions.push(`s.tempo >= $${params.length}`);
  }
  if (hasTempoMax) {
    params.push(f.tempoMax!);
    conditions.push(`s.tempo <= $${params.length}`);
  }
  if (tagList.length > 0) {
    params.push(tagList);
    conditions.push(`s.tags && $${params.length}::text[]`);
  }

  const whereSql = conditions.join(' AND ');

  if (memberId == null) {
    const result = await query(
      `SELECT * FROM songs s WHERE ${whereSql} ORDER BY COALESCE(s.song_number, 2147483647) ASC, s.title ASC`,
      params
    );
    return result.rows.map((row) => ({ ...mapSong(row as Record<string, unknown>) }));
  }

  const mid1 = params.length + 1;
  const mid2 = params.length + 2;
  const result = await query(
    `SELECT s.*,
            (sv.id IS NOT NULL) AS has_studio_version,
            (f.song_id IS NOT NULL) AS is_favorite
     FROM songs s
     LEFT JOIN studio_versions sv ON sv.song_id = s.id AND sv.member_id = $${mid1}
     LEFT JOIN song_favorites f ON f.song_id = s.id AND f.member_id = $${mid2}
     WHERE ${whereSql}
     ORDER BY COALESCE(s.song_number, 2147483647) ASC, s.title ASC`,
    [...params, memberId, memberId]
  );

  return result.rows.map((row) => {
    const base = mapSong(row as Record<string, unknown>);
    return {
      ...base,
      has_studio_version: Boolean((row as { has_studio_version?: boolean }).has_studio_version),
      is_favorite: Boolean((row as { is_favorite?: boolean }).is_favorite),
    };
  });
}

export async function getSongById(
  id: number,
  memberId: number | null
): Promise<SongListItem | null> {
  if (memberId == null) {
    const result = await query(
      `SELECT * FROM songs WHERE id = $1 AND is_published = TRUE`,
      [id]
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapSong(row) : null;
  }

  const result = await query(
    `SELECT s.*,
            (sv.id IS NOT NULL) AS has_studio_version,
            (f.song_id IS NOT NULL) AS is_favorite
     FROM songs s
     LEFT JOIN studio_versions sv ON sv.song_id = s.id AND sv.member_id = $2
     LEFT JOIN song_favorites f ON f.song_id = s.id AND f.member_id = $2
     WHERE s.id = $1 AND s.is_published = TRUE`,
    [id, memberId]
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const base = mapSong(row);
  return {
    ...base,
    has_studio_version: Boolean((row as { has_studio_version?: boolean }).has_studio_version),
    is_favorite: Boolean((row as { is_favorite?: boolean }).is_favorite),
  };
}

export interface CreateSongInput {
  song_number?: number | null;
  title: string;
  content?: string;
  default_key?: string | null;
  tempo?: number | null;
  time_signature?: string | null;
  tags?: string[];
  is_published?: boolean;
  created_by_member_id: number | null;
}

export async function createSong(input: CreateSongInput): Promise<SongRow> {
  const title = input.title.trim();
  if (!title) {
    throw new Error('title required');
  }

  const tags = input.tags?.length ? input.tags : [];

  const result = await query(
    `INSERT INTO songs (song_number, title, slug, content, default_key, tempo, time_signature, tags, is_published, created_by_member_id)
     VALUES (
       COALESCE(
         $1,
         (SELECT COALESCE(MAX(s2.song_number), 0) + 1 FROM songs s2)
       ),
       $2,
       gen_random_uuid()::text,
       $3,
       $4,
       $5,
       $6,
       $7::text[],
       COALESCE($8, TRUE),
       $9
     )
     RETURNING *`,
    [
      input.song_number ?? null,
      title,
      input.content ?? '',
      input.default_key ?? null,
      input.tempo ?? null,
      input.time_signature ?? null,
      tags,
      input.is_published ?? true,
      input.created_by_member_id,
    ]
  );

  const row = result.rows[0] as Record<string, unknown>;
  const id = Number(row.id);
  const slug = `${slugifyTitle(title)}-${id}`;
  const upd = await query(`UPDATE songs SET slug = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [
    slug,
    id,
  ]);
  return mapSong(upd.rows[0] as Record<string, unknown>);
}

export interface UpdateSongInput {
  title?: string;
  content?: string;
  default_key?: string | null;
  tempo?: number | null;
  time_signature?: string | null;
  tags?: string[];
  is_published?: boolean;
}

export async function updateSong(id: number, input: UpdateSongInput): Promise<SongRow | null> {
  const fields: string[] = [];
  const vals: unknown[] = [];
  let n = 0;
  const push = (col: string, v: unknown) => {
    n += 1;
    fields.push(`${col} = $${n}`);
    vals.push(v);
  };

  if (input.title !== undefined) push('title', input.title.trim());
  if (input.content !== undefined) push('content', input.content);
  if (input.default_key !== undefined) push('default_key', input.default_key);
  if (input.tempo !== undefined) push('tempo', input.tempo);
  if (input.time_signature !== undefined) push('time_signature', input.time_signature);
  if (input.tags !== undefined) push('tags', input.tags);
  if (input.is_published !== undefined) push('is_published', input.is_published);

  if (fields.length === 0) {
    const r = await query(`SELECT * FROM songs WHERE id = $1`, [id]);
    return r.rows[0] ? mapSong(r.rows[0] as Record<string, unknown>) : null;
  }

  fields.push('updated_at = NOW()');
  vals.push(id);
  const result = await query(
    `UPDATE songs SET ${fields.join(', ')} WHERE id = $${n + 1} RETURNING *`,
    vals
  );
  return result.rows[0] ? mapSong(result.rows[0] as Record<string, unknown>) : null;
}

export async function deleteSong(id: number): Promise<boolean> {
  const result = await query(`DELETE FROM songs WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function getVersionFlags(
  memberId: number,
  songIds: number[]
): Promise<Record<number, boolean>> {
  if (songIds.length === 0) return {};
  const result = await query(
    `SELECT song_id FROM studio_versions WHERE member_id = $1 AND song_id = ANY($2::bigint[])`,
    [memberId, songIds]
  );
  const flags: Record<number, boolean> = {};
  for (const id of songIds) flags[id] = false;
  for (const row of result.rows as { song_id: string }[]) {
    flags[Number(row.song_id)] = true;
  }
  return flags;
}

export async function addFavorite(memberId: number, songId: number): Promise<void> {
  await query(
    `INSERT INTO song_favorites (member_id, song_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [memberId, songId]
  );
}

export async function removeFavorite(memberId: number, songId: number): Promise<void> {
  await query(`DELETE FROM song_favorites WHERE member_id = $1 AND song_id = $2`, [memberId, songId]);
}

export async function recordSongOpened(memberId: number, songId: number): Promise<void> {
  await query(
    `INSERT INTO studio_song_recents (member_id, song_id, last_opened_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (member_id, song_id) DO UPDATE SET last_opened_at = EXCLUDED.last_opened_at`,
    [memberId, songId]
  );
}

export async function listRecentSongs(memberId: number, limit = 10): Promise<SongListItem[]> {
  const result = await query(
    `SELECT s.*,
            (sv.id IS NOT NULL) AS has_studio_version,
            (f.song_id IS NOT NULL) AS is_favorite
     FROM studio_song_recents r
     JOIN songs s ON s.id = r.song_id AND s.is_published = TRUE
     LEFT JOIN studio_versions sv ON sv.song_id = s.id AND sv.member_id = $1
     LEFT JOIN song_favorites f ON f.song_id = s.id AND f.member_id = $1
     WHERE r.member_id = $1
     ORDER BY r.last_opened_at DESC
     LIMIT $2`,
    [memberId, limit]
  );
  return result.rows.map((row) => {
    const base = mapSong(row as Record<string, unknown>);
    return {
      ...base,
      has_studio_version: Boolean((row as { has_studio_version?: boolean }).has_studio_version),
      is_favorite: Boolean((row as { is_favorite?: boolean }).is_favorite),
    };
  });
}
