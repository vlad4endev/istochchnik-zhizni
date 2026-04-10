import { query } from '../config/db';

import type { SongRow } from './songService';

function mapSong(row: Record<string, unknown>): SongRow {
  const rawTags = row.tags;
  const tags = Array.isArray(rawTags) ? rawTags.map((t) => String(t)) : [];
  return {
    id: String(row.id),
    title: String(row.title),
    slug: String(row.slug),
    content: String(row.content ?? ''),
    default_key: row.default_key != null ? String(row.default_key) : null,
    tempo: row.tempo != null ? Number(row.tempo) : null,
    time_signature: row.time_signature != null ? String(row.time_signature) : null,
    tags,
    is_published: Boolean(row.is_published),
    created_by_member_id:
      row.created_by_member_id != null ? Number(row.created_by_member_id) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export interface StudioVersionRow {
  id: string;
  member_id: number;
  song_id: string;
  custom_content: string | null;
  custom_key: string | null;
  updated_at: string;
}

export async function upsertStudioVersion(
  memberId: number,
  songId: number,
  customContent: string | null,
  customKey: string | null
): Promise<StudioVersionRow> {
  const result = await query(
    `INSERT INTO studio_versions (member_id, song_id, custom_content, custom_key, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (member_id, song_id)
     DO UPDATE SET
       custom_content = COALESCE(EXCLUDED.custom_content, studio_versions.custom_content),
       custom_key = COALESCE(EXCLUDED.custom_key, studio_versions.custom_key),
       updated_at = NOW()
     RETURNING *`,
    [memberId, songId, customContent, customKey]
  );
  const row = result.rows[0] as Record<string, unknown>;
  return {
    id: String(row.id),
    member_id: Number(row.member_id),
    song_id: String(row.song_id),
    custom_content: row.custom_content != null ? String(row.custom_content) : null,
    custom_key: row.custom_key != null ? String(row.custom_key) : null,
    updated_at: String(row.updated_at),
  };
}

export async function listMyStudioVersions(memberId: number): Promise<
  (StudioVersionRow & { song_title: string; song_slug: string })[]
> {
  const result = await query(
    `SELECT sv.*, s.title AS song_title, s.slug AS song_slug
     FROM studio_versions sv
     JOIN songs s ON s.id = sv.song_id
     WHERE sv.member_id = $1
     ORDER BY sv.updated_at DESC`,
    [memberId]
  );
  return result.rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      member_id: Number(r.member_id),
      song_id: String(r.song_id),
      custom_content: r.custom_content != null ? String(r.custom_content) : null,
      custom_key: r.custom_key != null ? String(r.custom_key) : null,
      updated_at: String(r.updated_at),
      song_title: String(r.song_title),
      song_slug: String(r.song_slug),
    };
  });
}

export async function getStudioVersionForSong(
  memberId: number,
  songId: number
): Promise<StudioVersionRow | null> {
  const result = await query(
    `SELECT * FROM studio_versions WHERE member_id = $1 AND song_id = $2`,
    [memberId, songId]
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    member_id: Number(row.member_id),
    song_id: String(row.song_id),
    custom_content: row.custom_content != null ? String(row.custom_content) : null,
    custom_key: row.custom_key != null ? String(row.custom_key) : null,
    updated_at: String(row.updated_at),
  };
}

export interface StudioDraftRow {
  id: string;
  member_id: number;
  title: string;
  content: string;
  updated_at: string;
}

export async function listDrafts(memberId: number): Promise<StudioDraftRow[]> {
  const result = await query(
    `SELECT * FROM studio_drafts WHERE member_id = $1 ORDER BY updated_at DESC`,
    [memberId]
  );
  return result.rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      member_id: Number(r.member_id),
      title: String(r.title ?? ''),
      content: String(r.content ?? ''),
      updated_at: String(r.updated_at),
    };
  });
}

export async function createDraft(memberId: number, title: string, content: string): Promise<StudioDraftRow> {
  const result = await query(
    `INSERT INTO studio_drafts (member_id, title, content, updated_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING *`,
    [memberId, title.trim(), content]
  );
  const r = result.rows[0] as Record<string, unknown>;
  return {
    id: String(r.id),
    member_id: Number(r.member_id),
    title: String(r.title ?? ''),
    content: String(r.content ?? ''),
    updated_at: String(r.updated_at),
  };
}

export async function updateDraft(
  memberId: number,
  draftId: number,
  input: { title?: string; content?: string }
): Promise<StudioDraftRow | null> {
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
  if (fields.length === 0) {
    const r = await query(`SELECT * FROM studio_drafts WHERE id = $1 AND member_id = $2`, [
      draftId,
      memberId,
    ]);
    const row = r.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      member_id: Number(row.member_id),
      title: String(row.title ?? ''),
      content: String(row.content ?? ''),
      updated_at: String(row.updated_at),
    };
  }
  fields.push('updated_at = NOW()');
  vals.push(draftId, memberId);
  const result = await query(
    `UPDATE studio_drafts SET ${fields.join(', ')} WHERE id = $${n + 1} AND member_id = $${n + 2} RETURNING *`,
    vals
  );
  const r = result.rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    id: String(r.id),
    member_id: Number(r.member_id),
    title: String(r.title ?? ''),
    content: String(r.content ?? ''),
    updated_at: String(r.updated_at),
  };
}

export async function deleteDraft(memberId: number, draftId: number): Promise<boolean> {
  const result = await query(`DELETE FROM studio_drafts WHERE id = $1 AND member_id = $2`, [
    draftId,
    memberId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

export interface InstrumentSettingsRow {
  member_id: number;
  settings: Record<string, unknown>;
  updated_at: string;
}

export async function getInstrumentSettings(memberId: number): Promise<InstrumentSettingsRow> {
  const found = await query(`SELECT * FROM studio_instrument_settings WHERE member_id = $1`, [
    memberId,
  ]);
  if (found.rows[0]) {
    const r = found.rows[0] as Record<string, unknown>;
    return {
      member_id: Number(r.member_id),
      settings: (r.settings as Record<string, unknown>) ?? {},
      updated_at: String(r.updated_at),
    };
  }
  const result = await query(
    `INSERT INTO studio_instrument_settings (member_id, settings, updated_at)
     VALUES ($1, '{}'::jsonb, NOW())
     RETURNING *`,
    [memberId]
  );
  const r = result.rows[0] as Record<string, unknown>;
  return {
    member_id: Number(r.member_id),
    settings: (r.settings as Record<string, unknown>) ?? {},
    updated_at: String(r.updated_at),
  };
}

export async function patchInstrumentSettings(
  memberId: number,
  patch: Record<string, unknown>
): Promise<InstrumentSettingsRow> {
  const result = await query(
    `INSERT INTO studio_instrument_settings (member_id, settings, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (member_id) DO UPDATE SET
       settings = studio_instrument_settings.settings || EXCLUDED.settings,
       updated_at = NOW()
     RETURNING *`,
    [memberId, JSON.stringify(patch)]
  );
  const r = result.rows[0] as Record<string, unknown>;
  return {
    member_id: Number(r.member_id),
    settings: (r.settings as Record<string, unknown>) ?? {},
    updated_at: String(r.updated_at),
  };
}

export interface SetlistRow {
  id: string;
  member_id: number;
  title: string;
  event_date: string | null;
  is_public: boolean;
  share_token: string;
  created_at: string;
  updated_at: string;
}

export async function listSetlists(memberId: number): Promise<SetlistRow[]> {
  const result = await query(
    `SELECT * FROM setlists WHERE member_id = $1 ORDER BY COALESCE(event_date, created_at::date) DESC, title ASC`,
    [memberId]
  );
  return result.rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      member_id: Number(r.member_id),
      title: String(r.title),
      event_date: r.event_date != null ? String(r.event_date).slice(0, 10) : null,
      is_public: Boolean(r.is_public),
      share_token: r.share_token != null ? String(r.share_token) : '',
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
    };
  });
}

export async function createSetlist(
  memberId: number,
  title: string,
  eventDate: string | null
): Promise<SetlistRow> {
  const result = await query(
    `INSERT INTO setlists (member_id, title, event_date, updated_at)
     VALUES ($1, $2, $3::date, NOW())
     RETURNING *`,
    [memberId, title.trim(), eventDate]
  );
  const r = result.rows[0] as Record<string, unknown>;
  return {
    id: String(r.id),
    member_id: Number(r.member_id),
    title: String(r.title),
    event_date: r.event_date != null ? String(r.event_date).slice(0, 10) : null,
    is_public: Boolean(r.is_public),
    share_token: r.share_token != null ? String(r.share_token) : '',
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

export async function updateSetlist(
  memberId: number,
  setlistId: number,
  input: { title?: string; event_date?: string | null; is_public?: boolean }
): Promise<SetlistRow | null> {
  const fields: string[] = [];
  const vals: unknown[] = [];
  let n = 0;
  const push = (col: string, v: unknown) => {
    n += 1;
    fields.push(`${col} = $${n}`);
    vals.push(v);
  };
  if (input.title !== undefined) push('title', input.title.trim());
  if (input.event_date !== undefined) {
    push('event_date', input.event_date === null ? null : input.event_date);
  }
  if (input.is_public !== undefined) {
    push('is_public', input.is_public);
  }
  if (fields.length === 0) {
    const r = await query(`SELECT * FROM setlists WHERE id = $1 AND member_id = $2`, [
      setlistId,
      memberId,
    ]);
    const row = r.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      member_id: Number(row.member_id),
      title: String(row.title),
      event_date: row.event_date != null ? String(row.event_date).slice(0, 10) : null,
      is_public: Boolean(row.is_public),
      share_token: row.share_token != null ? String(row.share_token) : '',
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }
  fields.push('updated_at = NOW()');
  vals.push(setlistId, memberId);
  const result = await query(
    `UPDATE setlists SET ${fields.join(', ')} WHERE id = $${n + 1} AND member_id = $${n + 2} RETURNING *`,
    vals
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    member_id: Number(row.member_id),
    title: String(row.title),
    event_date: row.event_date != null ? String(row.event_date).slice(0, 10) : null,
    is_public: Boolean(row.is_public),
    share_token: row.share_token != null ? String(row.share_token) : '',
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function deleteSetlist(memberId: number, setlistId: number): Promise<boolean> {
  const result = await query(`DELETE FROM setlists WHERE id = $1 AND member_id = $2`, [
    setlistId,
    memberId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

export interface SetlistItemRow {
  id: string;
  setlist_id: string;
  position: number;
  song_id: string;
  studio_version_id: string | null;
  song: SongRow;
  effective_key: string | null;
  /** Полный текст для режима выступления */
  effective_content: string;
  effective_content_preview: string;
}

async function fetchSetlistItemRows(setlistId: number): Promise<SetlistItemRow[]> {
  const result = await query(
    `SELECT si.id, si.setlist_id, si.position, si.song_id, si.studio_version_id,
            s.id AS s_id, s.title, s.slug, s.content, s.default_key, s.tempo, s.time_signature,
            s.tags, s.is_published, s.created_by_member_id, s.created_at, s.updated_at,
            sv.custom_key, sv.custom_content
     FROM setlist_items si
     JOIN songs s ON s.id = si.song_id
     LEFT JOIN studio_versions sv ON sv.id = si.studio_version_id
     WHERE si.setlist_id = $1
     ORDER BY si.position ASC`,
    [setlistId]
  );

  return result.rows.map((row) => {
    const r = row as Record<string, unknown>;
    const song = mapSong({
      id: r.s_id,
      title: r.title,
      slug: r.slug,
      content: r.content,
      default_key: r.default_key,
      tempo: r.tempo,
      time_signature: r.time_signature,
      tags: r.tags,
      is_published: r.is_published,
      created_by_member_id: r.created_by_member_id,
      created_at: r.created_at,
      updated_at: r.updated_at,
    });
    const customKey = r.custom_key != null ? String(r.custom_key) : null;
    const customContent = r.custom_content != null ? String(r.custom_content) : null;
    const effectiveKey = customKey ?? song.default_key;
    const effectiveContent = (customContent && customContent.trim() ? customContent : song.content) ?? '';
    const preview = effectiveContent.slice(0, 200);
    return {
      id: String(r.id),
      setlist_id: String(r.setlist_id),
      position: Number(r.position),
      song_id: String(r.song_id),
      studio_version_id: r.studio_version_id != null ? String(r.studio_version_id) : null,
      song,
      effective_key: effectiveKey,
      effective_content: effectiveContent,
      effective_content_preview: preview,
    };
  });
}

export async function listSetlistItems(memberId: number, setlistId: number): Promise<SetlistItemRow[]> {
  const owner = await query(`SELECT 1 FROM setlists WHERE id = $1 AND member_id = $2`, [
    setlistId,
    memberId,
  ]);
  if (owner.rows.length === 0) return [];
  return fetchSetlistItemRows(setlistId);
}

export async function addSetlistItem(
  memberId: number,
  setlistId: number,
  songId: number,
  studioVersionId: number | null
): Promise<void> {
  const check = await query(`SELECT 1 FROM setlists WHERE id = $1 AND member_id = $2`, [
    setlistId,
    memberId,
  ]);
  if (check.rows.length === 0) {
    throw new Error('setlist not found');
  }

  if (studioVersionId != null) {
    const v = await query(
      `SELECT 1 FROM studio_versions WHERE id = $1 AND member_id = $2 AND song_id = $3`,
      [studioVersionId, memberId, songId]
    );
    if (v.rows.length === 0) {
      throw new Error('invalid studio_version_id for this song');
    }
  }

  const max = await query(
    `SELECT COALESCE(MAX(position), -1)::int AS m FROM setlist_items WHERE setlist_id = $1`,
    [setlistId]
  );
  const pos = Number(max.rows[0]?.m ?? -1) + 1;

  await query(
    `INSERT INTO setlist_items (setlist_id, position, song_id, studio_version_id)
     VALUES ($1, $2, $3, $4)`,
    [setlistId, pos, songId, studioVersionId]
  );
}

export async function removeSetlistItem(
  memberId: number,
  setlistId: number,
  itemId: number
): Promise<void> {
  const check = await query(`SELECT 1 FROM setlists WHERE id = $1 AND member_id = $2`, [
    setlistId,
    memberId,
  ]);
  if (check.rows.length === 0) {
    throw new Error('setlist not found');
  }
  await query(`DELETE FROM setlist_items WHERE id = $1 AND setlist_id = $2`, [itemId, setlistId]);
  await renumberSetlistPositions(setlistId);
}

async function renumberSetlistPositions(setlistId: number): Promise<void> {
  const items = await query(
    `SELECT id FROM setlist_items WHERE setlist_id = $1 ORDER BY position ASC`,
    [setlistId]
  );
  let p = 0;
  for (const row of items.rows as { id: string }[]) {
    await query(`UPDATE setlist_items SET position = $1 WHERE id = $2`, [p, row.id]);
    p += 1;
  }
}

export async function reorderSetlistItems(
  memberId: number,
  setlistId: number,
  orderedItemIds: number[]
): Promise<void> {
  const check = await query(`SELECT 1 FROM setlists WHERE id = $1 AND member_id = $2`, [
    setlistId,
    memberId,
  ]);
  if (check.rows.length === 0) {
    throw new Error('setlist not found');
  }
  let pos = 0;
  for (const id of orderedItemIds) {
    await query(
      `UPDATE setlist_items SET position = $1 WHERE id = $2 AND setlist_id = $3`,
      [pos, id, setlistId]
    );
    pos += 1;
  }
}

export async function getPerformancePayload(
  memberId: number,
  setlistId: number
): Promise<{ setlist: SetlistRow; items: SetlistItemRow[] } | null> {
  const sl = await query(`SELECT * FROM setlists WHERE id = $1 AND member_id = $2`, [
    setlistId,
    memberId,
  ]);
  const row = sl.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const setlist: SetlistRow = {
    id: String(row.id),
    member_id: Number(row.member_id),
    title: String(row.title),
    event_date: row.event_date != null ? String(row.event_date).slice(0, 10) : null,
    is_public: Boolean(row.is_public),
    share_token: row.share_token != null ? String(row.share_token) : '',
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
  const items = await listSetlistItems(memberId, setlistId);
  return { setlist, items };
}

export async function getPublicSetlistByToken(
  token: string
): Promise<{ setlist: SetlistRow; items: SetlistItemRow[] } | null> {
  const t = token.trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(t)) {
    return null;
  }
  const sl = await query(
    `SELECT * FROM setlists WHERE share_token = $1::uuid AND is_public = TRUE`,
    [t]
  );
  const row = sl.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const setlistId = Number(row.id);
  const setlist: SetlistRow = {
    id: String(row.id),
    member_id: Number(row.member_id),
    title: String(row.title),
    event_date: row.event_date != null ? String(row.event_date).slice(0, 10) : null,
    is_public: true,
    share_token: String(row.share_token),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
  const items = await fetchSetlistItemRows(setlistId);
  return { setlist, items };
}
