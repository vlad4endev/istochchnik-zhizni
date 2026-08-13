import { query } from '../config/db';

import type { SongRow } from './songService';

function resolvePublicTokenTtlDays(): number {
  const raw = Number(process.env.PUBLIC_SHARE_TOKEN_MAX_AGE_DAYS ?? 365);
  if (!Number.isFinite(raw)) return 365;
  return Math.min(3650, Math.max(1, Math.floor(raw)));
}

// SECURITY FIX: ограничиваем срок жизни публичного share_token для сетлистов.
const PUBLIC_SETLIST_TOKEN_MAX_AGE_DAYS = resolvePublicTokenTtlDays();

let setlistSchemaEnsure: Promise<void> | null = null;

async function alterIfTableExists(table: string, alterSql: string): Promise<void> {
  const reg = await query(`SELECT to_regclass($1) AS reg`, [`public.${table}`]);
  const exists = (reg.rows[0] as { reg?: string | null } | undefined)?.reg;
  if (!exists) return;
  await query(alterSql);
}

/**
 * Схема сетлистов/доступа к программам, нужная API студии.
 * На проде с SKIP_DB_INIT_ON_START миграции могут не примениться — без этих
 * колонок GET /api/studio/setlists и /items|/performance отвечают 500.
 * Column-only ALTER (без FK): работает даже если роль не может REFERENCES.
 */
export async function ensureSetlistSchema(): Promise<void> {
  if (!setlistSchemaEnsure) {
    setlistSchemaEnsure = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS public.service_plans (
          id BIGSERIAL PRIMARY KEY,
          service_date DATE,
          title TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await query(
        `ALTER TABLE public.service_plans ADD COLUMN IF NOT EXISTS created_by_member_id INTEGER`,
      );
      await query(
        `ALTER TABLE public.service_plans ADD COLUMN IF NOT EXISTS last_edited_by_member_id INTEGER`,
      );
      await query(
        `ALTER TABLE public.service_plans ADD COLUMN IF NOT EXISTS music_ministry_member_id INTEGER`,
      );

      // listSetlists / canAccessSetlist JOIN по source_service_plan_id
      await alterIfTableExists(
        'setlists',
        `ALTER TABLE public.setlists ADD COLUMN IF NOT EXISTS source_service_plan_id BIGINT`,
      );

      // fetchSetlistItemRows читает заметки музыканта
      await alterIfTableExists(
        'setlist_items',
        `ALTER TABLE public.setlist_items ADD COLUMN IF NOT EXISTS musician_notes JSONB NOT NULL DEFAULT '{}'::jsonb`,
      );

      // Партитуры в studio_versions (migration 20260624120000)
      await alterIfTableExists(
        'studio_versions',
        `ALTER TABLE public.studio_versions ADD COLUMN IF NOT EXISTS sheet_content TEXT`,
      );
      await alterIfTableExists(
        'studio_versions',
        `ALTER TABLE public.studio_versions ADD COLUMN IF NOT EXISTS sheet_key VARCHAR(32)`,
      );
      await alterIfTableExists(
        'studio_versions',
        `ALTER TABLE public.studio_versions ADD COLUMN IF NOT EXISTS sheet_meta JSONB`,
      );
    })().catch((err) => {
      setlistSchemaEnsure = null;
      throw err;
    });
  }
  await setlistSchemaEnsure;
}

function mapSong(row: Record<string, unknown>): SongRow {
  const rawTags = row.tags;
  const tags = Array.isArray(rawTags) ? rawTags.map((t) => String(t)) : [];
  return {
    id: String(row.id),
    song_number: row.song_number != null ? Number(row.song_number) : null,
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

export interface StudioSheetMeta {
  bpm?: number | null;
  timeSignature?: string | null;
  composer?: string | null;
  arranger?: string | null;
  title?: string | null;
  generalNotes?: string | null;
  abcNotation?: string | null;
  sourceImageUrl?: string | null;
}

function parseStudioSheetMeta(raw: unknown): StudioSheetMeta | null {
  if (raw == null || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  return {
    bpm: typeof m.bpm === 'number' ? m.bpm : null,
    timeSignature: typeof m.timeSignature === 'string' ? m.timeSignature : null,
    composer: typeof m.composer === 'string' ? m.composer : null,
    arranger: typeof m.arranger === 'string' ? m.arranger : null,
    title: typeof m.title === 'string' ? m.title : null,
    generalNotes: typeof m.generalNotes === 'string' ? m.generalNotes : null,
    abcNotation: typeof m.abcNotation === 'string' ? m.abcNotation : null,
    sourceImageUrl: typeof m.sourceImageUrl === 'string' ? m.sourceImageUrl : null,
  };
}

export interface StudioVersionRow {
  id: string;
  member_id: number;
  song_id: string;
  custom_content: string | null;
  custom_key: string | null;
  sheet_content: string | null;
  sheet_key: string | null;
  sheet_meta: StudioSheetMeta | null;
  updated_at: string;
}

function mapStudioVersionRow(row: Record<string, unknown>): StudioVersionRow {
  let sheet_meta: StudioSheetMeta | null = null;
  const rawMeta = row.sheet_meta;
  if (rawMeta != null) {
    sheet_meta = parseStudioSheetMeta(rawMeta);
  }
  return {
    id: String(row.id),
    member_id: Number(row.member_id),
    song_id: String(row.song_id),
    custom_content: row.custom_content != null ? String(row.custom_content) : null,
    custom_key: row.custom_key != null ? String(row.custom_key) : null,
    sheet_content: row.sheet_content != null ? String(row.sheet_content) : null,
    sheet_key: row.sheet_key != null ? String(row.sheet_key) : null,
    sheet_meta,
    updated_at: String(row.updated_at),
  };
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
  return mapStudioVersionRow(row);
}

export async function upsertStudioSheetVersion(
  memberId: number,
  songId: number,
  sheetContent: string,
  sheetKey: string | null,
  sheetMeta: StudioSheetMeta | null,
): Promise<StudioVersionRow> {
  const result = await query(
    `INSERT INTO studio_versions (member_id, song_id, sheet_content, sheet_key, sheet_meta, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
     ON CONFLICT (member_id, song_id)
     DO UPDATE SET
       sheet_content = EXCLUDED.sheet_content,
       sheet_key = EXCLUDED.sheet_key,
       sheet_meta = EXCLUDED.sheet_meta,
       updated_at = NOW()
     RETURNING *`,
    [memberId, songId, sheetContent, sheetKey, sheetMeta ? JSON.stringify(sheetMeta) : null],
  );
  const row = result.rows[0] as Record<string, unknown>;
  return mapStudioVersionRow(row);
}

export async function listMyStudioVersions(memberId: number): Promise<
  (StudioVersionRow & { song_title: string; song_slug: string; song_is_published: boolean })[]
> {
  const result = await query(
    `SELECT sv.*, s.title AS song_title, s.slug AS song_slug, s.is_published AS song_is_published
     FROM studio_versions sv
     JOIN songs s ON s.id = sv.song_id
     WHERE sv.member_id = $1
     ORDER BY sv.updated_at DESC`,
    [memberId]
  );
  return result.rows.map((row) => {
    const mapped = mapStudioVersionRow(row as Record<string, unknown>);
    const r = row as Record<string, unknown>;
    return {
      ...mapped,
      song_title: String(r.song_title),
      song_slug: String(r.song_slug),
      song_is_published: Boolean(r.song_is_published),
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
  return mapStudioVersionRow(row);
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
  source_service_plan_id: number | null;
  created_at: string;
  updated_at: string;
}

function mapSetlistRow(row: Record<string, unknown>): SetlistRow {
  return {
    id: String(row.id),
    member_id: Number(row.member_id),
    title: String(row.title),
    event_date: row.event_date != null ? String(row.event_date).slice(0, 10) : null,
    is_public: Boolean(row.is_public),
    share_token: row.share_token != null ? String(row.share_token) : '',
    source_service_plan_id:
      row.source_service_plan_id == null ? null : Number(row.source_service_plan_id),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/**
 * Сетлисты пользователя + автосозданные из программ, где он ответственный /
 * создатель / последний редактор (чтобы админ видел результат публикации).
 * При includeAllPlanner — все сетлисты из планировщика (admin/editor).
 */
export async function listSetlists(
  memberId: number,
  opts?: { includeAllPlanner?: boolean }
): Promise<SetlistRow[]> {
  await ensureSetlistSchema();
  const includeAllPlanner = Boolean(opts?.includeAllPlanner);
  const result = await query(
    `SELECT DISTINCT ON (sl.id) sl.*
     FROM setlists sl
     LEFT JOIN public.service_plans p ON p.id = sl.source_service_plan_id
     WHERE sl.member_id = $1
        OR (
          sl.source_service_plan_id IS NOT NULL
          AND (
            $2::boolean
            OR p.music_ministry_member_id = $1
            OR p.created_by_member_id = $1
            OR p.last_edited_by_member_id = $1
          )
        )
     ORDER BY sl.id, COALESCE(sl.event_date, sl.created_at::date) DESC, sl.title ASC`,
    [memberId, includeAllPlanner]
  );
  // DISTINCT ON (id) требует ORDER BY id first — пересортируем для UI.
  const rows = result.rows.map((row) => mapSetlistRow(row as Record<string, unknown>));
  rows.sort((a, b) => {
    const da = a.event_date ?? a.created_at.slice(0, 10);
    const db = b.event_date ?? b.created_at.slice(0, 10);
    if (da !== db) return db.localeCompare(da);
    return a.title.localeCompare(b.title, 'ru');
  });
  return rows;
}

export async function createSetlist(
  memberId: number,
  title: string,
  eventDate: string | null
): Promise<SetlistRow> {
  // Явно задаём is_public / share_token_issued_at — на старых БД без DEFAULT INSERT иначе падает.
  const result = await query(
    `INSERT INTO setlists (member_id, title, event_date, is_public, share_token_issued_at, updated_at)
     VALUES ($1, $2, $3::date, FALSE, NOW(), NOW())
     RETURNING *`,
    [memberId, title.trim(), eventDate]
  );
  const r = result.rows[0] as Record<string, unknown>;
  return mapSetlistRow(r);
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
    return mapSetlistRow(row);
  }
  fields.push('updated_at = NOW()');
  vals.push(setlistId, memberId);
  const result = await query(
    `UPDATE setlists SET ${fields.join(', ')} WHERE id = $${n + 1} AND member_id = $${n + 2} RETURNING *`,
    vals
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return mapSetlistRow(row);
}

export async function deleteSetlist(memberId: number, setlistId: number): Promise<boolean> {
  const result = await query(`DELETE FROM setlists WHERE id = $1 AND member_id = $2`, [
    setlistId,
    memberId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

/** Чтение сетлиста: владелец или участник связанной программы / менеджер студии. */
export async function canAccessSetlist(
  memberId: number,
  setlistId: number,
  opts?: { includeAllPlanner?: boolean }
): Promise<boolean> {
  await ensureSetlistSchema();
  const includeAllPlanner = Boolean(opts?.includeAllPlanner);
  const r = await query(
    `SELECT 1
     FROM setlists sl
     LEFT JOIN public.service_plans p ON p.id = sl.source_service_plan_id
     WHERE sl.id = $1
       AND (
         sl.member_id = $2
         OR (
           sl.source_service_plan_id IS NOT NULL
           AND (
             $3::boolean
             OR p.music_ministry_member_id = $2
             OR p.created_by_member_id = $2
             OR p.last_edited_by_member_id = $2
           )
         )
       )
     LIMIT 1`,
    [setlistId, memberId, includeAllPlanner]
  );
  return (r.rowCount ?? 0) > 0;
}

/** v1: lineComments — ключ «индекс строки текста» (0-based), blockComments — диапазон строк. */
export type MusicianNotesV1 = {
  v: 1;
  lineComments?: Record<string, string>;
  blockComments?: Array<{ from: number; to: number; text: string }>;
};

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
  /** Версия с нотами (распознанная партитура), отдельно от текста песни */
  sheet_content: string | null;
  sheet_key: string | null;
  sheet_meta: StudioSheetMeta | null;
  /** Только для владельца / режима выступления (не отдаётся по публичной ссылке). */
  musician_notes: MusicianNotesV1;
}

/** Публичный просмотр: те же поля позиции, но без заметок для музыкантов. */
export type PublicSetlistItemRow = Omit<SetlistItemRow, 'musician_notes'>;

const EMPTY_NOTES: MusicianNotesV1 = { v: 1 };

function sanitizeMusicianNotes(raw: unknown): MusicianNotesV1 {
  if (raw == null || typeof raw !== 'object') return { ...EMPTY_NOTES };
  const o = raw as Record<string, unknown>;
  if (Number(o.v) !== 1) return { ...EMPTY_NOTES };

  let lineComments: Record<string, string> | undefined;
  if (o.lineComments != null && typeof o.lineComments === 'object') {
    lineComments = {};
    for (const [k, v] of Object.entries(o.lineComments as Record<string, unknown>)) {
      if (!/^\d+$/.test(k)) continue;
      const line = Number(k);
      if (!Number.isInteger(line) || line < 0 || line > 5000) continue;
      const text = String(v ?? '').trim().slice(0, 600);
      if (text) lineComments[String(line)] = text;
    }
    if (Object.keys(lineComments).length === 0) lineComments = undefined;
  }

  let blockComments: MusicianNotesV1['blockComments'];
  if (Array.isArray(o.blockComments)) {
    const blocks: NonNullable<MusicianNotesV1['blockComments']> = [];
    for (const x of o.blockComments) {
      if (x == null || typeof x !== 'object') continue;
      const b = x as Record<string, unknown>;
      const from = Number(b.from);
      const toRaw = Number(b.to);
      const text = String(b.text ?? '').trim().slice(0, 1200);
      if (!Number.isInteger(from) || !Number.isInteger(toRaw) || from < 0 || toRaw < from || toRaw > 5000 || !text) {
        continue;
      }
      const to = Math.min(toRaw, from + 400);
      blocks.push({ from, to, text });
    }
    if (blocks.length > 0) blockComments = blocks;
  }

  return { v: 1, lineComments, blockComments };
}

async function fetchSetlistItemRows(setlistId: number): Promise<SetlistItemRow[]> {
  await ensureSetlistSchema();
  const result = await query(
    `SELECT si.id, si.setlist_id, si.position, si.song_id, si.studio_version_id, si.musician_notes,
            s.id AS s_id, s.song_number, s.title, s.slug, s.content, s.default_key, s.tempo, s.time_signature,
            s.tags, s.is_published, s.created_by_member_id, s.created_at, s.updated_at,
            sv.custom_key, sv.custom_content,
            sv_sheet.sheet_content, sv_sheet.sheet_key, sv_sheet.sheet_meta
     FROM setlist_items si
     JOIN songs s ON s.id = si.song_id
     LEFT JOIN studio_versions sv ON sv.id = si.studio_version_id
     LEFT JOIN setlists sl ON sl.id = si.setlist_id
     LEFT JOIN studio_versions sv_sheet ON sv_sheet.song_id = si.song_id AND sv_sheet.member_id = sl.member_id
     WHERE si.setlist_id = $1
     ORDER BY si.position ASC`,
    [setlistId]
  );

  return result.rows.map((row) => {
    const r = row as Record<string, unknown>;
    const song = mapSong({
      id: r.s_id,
      song_number: r.song_number,
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
    const effectiveContent =
      customContent !== null && customContent !== undefined ? customContent : (song.content ?? '');
    const preview = effectiveContent.slice(0, 200);
    const rawNotes = r.musician_notes;
    let sheet_meta: StudioSheetMeta | null = null;
    const rawSheetMeta = r.sheet_meta;
    if (rawSheetMeta != null) {
      sheet_meta = parseStudioSheetMeta(rawSheetMeta);
    }
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
      sheet_content: r.sheet_content != null ? String(r.sheet_content) : null,
      sheet_key: r.sheet_key != null ? String(r.sheet_key) : null,
      sheet_meta,
      musician_notes: sanitizeMusicianNotes(rawNotes),
    };
  });
}

export async function listSetlistItems(
  memberId: number,
  setlistId: number,
  opts?: { includeAllPlanner?: boolean }
): Promise<SetlistItemRow[]> {
  const ok = await canAccessSetlist(memberId, setlistId, opts);
  if (!ok) return [];
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

export async function updateSetlistItemMusicianNotes(
  memberId: number,
  setlistId: number,
  itemId: number,
  notes: unknown
): Promise<boolean> {
  const safe = sanitizeMusicianNotes(notes);
  const result = await query(
    `UPDATE setlist_items si
     SET musician_notes = $1::jsonb
     FROM setlists sl
     WHERE si.id = $2 AND si.setlist_id = $3 AND sl.id = si.setlist_id AND sl.member_id = $4`,
    [JSON.stringify(safe), itemId, setlistId, memberId]
  );
  return (result.rowCount ?? 0) > 0;
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
  setlistId: number,
  opts?: { includeAllPlanner?: boolean }
): Promise<{ setlist: SetlistRow; items: SetlistItemRow[] } | null> {
  const ok = await canAccessSetlist(memberId, setlistId, opts);
  if (!ok) return null;
  const sl = await query(`SELECT * FROM setlists WHERE id = $1`, [setlistId]);
  const row = sl.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const setlist = mapSetlistRow(row);
  const items = await listSetlistItems(memberId, setlistId, opts);
  return { setlist, items };
}

export async function getPublicSetlistByToken(
  token: string
): Promise<{ setlist: SetlistRow; items: PublicSetlistItemRow[] } | null> {
  const t = token.trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(t)) {
    return null;
  }
  const sl = await query(
    `SELECT * FROM setlists
     WHERE share_token = $1::uuid
       AND is_public = TRUE
       AND share_token_issued_at >= now() - ($2::int * interval '1 day')`,
    [t, PUBLIC_SETLIST_TOKEN_MAX_AGE_DAYS]
  );
  const row = sl.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const setlistId = Number(row.id);
  const setlist: SetlistRow = { ...mapSetlistRow(row), is_public: true };
  const itemsFull = await fetchSetlistItemRows(setlistId);
  const items: PublicSetlistItemRow[] = itemsFull.map(({ musician_notes, ...rest }) => {
    void musician_notes;
    return rest;
  });
  return { setlist, items };
}
