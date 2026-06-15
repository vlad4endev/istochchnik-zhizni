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

const TAG_IMPORTED = 'импортированная';
/** Легаси-тег из сторонних импортов / старых скриптов (совпадает с вашими строками в БД). */
const TAG_IMPORTED_LEGACY = 'импортировано';
const TAG_MISSING_TEXT = 'нет_текста';
const ARCHIVE_TAG = '__archived';

const IMPORT_SANDBOX_TAGS: readonly string[] = [TAG_IMPORTED, TAG_IMPORTED_LEGACY];

/** Готовая песня (есть текст, не заготовка) — можно положить в каталог / песенник. */
export function isCatalogReady(content: string, tags: string[]): boolean {
  if (!content.trim()) return false;
  if (tags.includes(TAG_MISSING_TEXT)) return false;
  if (tags.includes(ARCHIVE_TAG)) return false;
  return true;
}

/** Фрагмент SQL: теги импорта с любым регистром + те же слова, что в IMPORT_SANDBOX_TAGS. */
function sqlImportedSandboxTagsMatch(): string {
  return `EXISTS (
    SELECT 1 FROM unnest(COALESCE(s.tags, '{}'::text[])) AS _imp(tag)
    WHERE lower(_imp.tag::text) IN ('импортированная', 'импортировано')
  )`;
}

function songHasImportedSandboxTag(tags: string[]): boolean {
  return tags.some((t) => IMPORT_SANDBOX_TAGS.includes(String(t)));
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

async function listSongsInternal(
  memberId: number | null,
  filters: SongListFilters | undefined,
  options: { includeUnpublished: boolean },
): Promise<SongListItem[]> {
  const f = filters ?? {};
  const search = (f.q ?? '').trim();
  const keyFilter = (f.key ?? '').trim();
  const hasTempoMin = f.tempoMin != null && Number.isFinite(f.tempoMin);
  const hasTempoMax = f.tempoMax != null && Number.isFinite(f.tempoMax);
  const tagList = (f.tags ?? []).map((t) => t.trim()).filter(Boolean);

  const conditions: string[] = options.includeUnpublished ? [] : ['s.is_published = TRUE'];
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
      `SELECT * FROM songs s ${whereSql ? `WHERE ${whereSql}` : ''} ORDER BY COALESCE(s.song_number, 2147483647) ASC, s.title ASC`,
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
     ${whereSql ? `WHERE ${whereSql}` : ''}
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

/** Общий песенник: все опубликованные песни каталога, без фильтра по автору. */
export async function listPublishedSongs(
  memberId: number | null,
  filters?: SongListFilters
): Promise<SongListItem[]> {
  return listSongsInternal(memberId, filters, { includeUnpublished: false });
}

export async function listCatalogSongsForModeration(
  memberId: number | null,
  filters?: SongListFilters,
): Promise<SongListItem[]> {
  return listSongsInternal(memberId, filters, {
    includeUnpublished: true,
  });
}

function mapImportedSandboxRows(rows: Record<string, unknown>[]): SongListItem[] {
  return rows.map((row) => {
    const base = mapSong(row);
    return {
      ...base,
      has_studio_version: Boolean((row as { has_studio_version?: boolean }).has_studio_version),
      is_favorite: Boolean((row as { is_favorite?: boolean }).is_favorite),
    };
  });
}

/** PG undefined_column или текст ошибки про отсутствующую колонку `imported_at`. */
function isMissingImportedAtColumnError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: string; message?: string };
  const msg = String(e.message ?? '');
  if (/imported_at/i.test(msg) && (/does not exist/i.test(msg) || /не существует/i.test(msg))) {
    return true;
  }
  return e.code === '42703' && /imported_at/i.test(msg);
}

async function listImportedSandboxSongsQuery(
  memberIdForJoins: number,
  includeImportedAt: boolean,
): Promise<SongListItem[]> {
  const tagSql = sqlImportedSandboxTagsMatch();
  const whereSql = includeImportedAt
    ? `NOT s.is_published AND (${tagSql} OR s.imported_at IS NOT NULL)`
    : `NOT s.is_published AND (${tagSql})`;

  const mid1 = 1;
  const mid2 = 2;
  const result = await query(
    `SELECT s.*,
            (sv.id IS NOT NULL) AS has_studio_version,
            (f.song_id IS NOT NULL) AS is_favorite
     FROM songs s
     LEFT JOIN studio_versions sv ON sv.song_id = s.id AND sv.member_id = $${mid1}
     LEFT JOIN song_favorites f ON f.song_id = s.id AND f.member_id = $${mid2}
     WHERE ${whereSql}
     ORDER BY COALESCE(s.song_number, 2147483647) ASC, s.title ASC`,
    [memberIdForJoins, memberIdForJoins],
  );

  return mapImportedSandboxRows(result.rows as Record<string, unknown>[]);
}

/**
 * Песни «песочницы» импорта для студии: не опубликованы и (тег импорта ИЛИ пометка imported_at).
 * Не зависит от query-string с кириллицей на `/moderation`.
 */
export async function listImportedSandboxSongsForStudio(
  memberIdForJoins: number,
): Promise<SongListItem[]> {
  try {
    return await listImportedSandboxSongsQuery(memberIdForJoins, true);
  } catch (err) {
    if (isMissingImportedAtColumnError(err)) {
      console.warn(
        '[songService] listImportedSandboxSongsForStudio: imported_at missing, falling back to tag-only filter',
      );
      return await listImportedSandboxSongsQuery(memberIdForJoins, false);
    }
    throw err;
  }
}

/** Права на просмотр одной песни (студия / модерация каталога). */
export type GetSongVisibilityOpts = {
  canModerateCatalog: boolean;
  /** Музыканты и муз. служение — общая песочница и черновики, не только автор. */
  canAccessStudioCatalog?: boolean;
};

function mapSongRowWithJoins(row: Record<string, unknown>): SongListItem {
  const base = mapSong(row);
  return {
    ...base,
    has_studio_version: Boolean((row as { has_studio_version?: boolean }).has_studio_version),
    is_favorite: Boolean((row as { is_favorite?: boolean }).is_favorite),
  };
}

export async function getSongById(
  id: number,
  memberId: number | null,
  visibility?: GetSongVisibilityOpts,
): Promise<SongListItem | null> {
  if (memberId == null) {
    const result = await query(
      `SELECT * FROM songs WHERE id = $1 AND is_published = TRUE`,
      [id]
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapSong(row) : null;
  }

  if (!visibility) {
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
    return mapSongRowWithJoins(row);
  }

  const canMod = visibility.canModerateCatalog;
  const canStudio = Boolean(visibility.canAccessStudioCatalog);

  const buildSql = () => `
      SELECT s.*,
             (sv.id IS NOT NULL) AS has_studio_version,
             (f.song_id IS NOT NULL) AS is_favorite
      FROM songs s
      LEFT JOIN studio_versions sv ON sv.song_id = s.id AND sv.member_id = $2
      LEFT JOIN song_favorites f ON f.song_id = s.id AND f.member_id = $3
      WHERE s.id = $1
        AND (
          s.is_published = TRUE
          OR $4::boolean IS TRUE
          OR $5::boolean IS TRUE
          OR (sv.id IS NOT NULL)
        )`;

  const params = [id, memberId, memberId, canMod, canStudio];

  const result = await query(buildSql(), params);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return mapSongRowWithJoins(row);
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

/** Песня в режиме «Импортированные»: не опубликована и есть тег импорта (канонический или легаси). */
export async function getSongImportStatus(
  id: number,
): Promise<{ exists: boolean; isImported: boolean; isPublished: boolean } | null> {
  const r = await query(`SELECT id, tags, is_published FROM songs WHERE id = $1 LIMIT 1`, [id]);
  const row = r.rows[0] as { id?: string; tags?: string[]; is_published?: boolean } | undefined;
  if (!row?.id) return null;
  const tags = Array.isArray(row.tags) ? row.tags.map((t) => String(t)) : [];
  return {
    exists: true,
    isImported: songHasImportedSandboxTag(tags),
    isPublished: Boolean(row.is_published),
  };
}

function stripImportSandboxTags(tags: string[]): string[] {
  return tags.filter(
    (t) => t !== TAG_IMPORTED && t !== TAG_IMPORTED_LEGACY && t !== TAG_MISSING_TEXT,
  );
}

/** Лучший текст из студийных версий, если в каталоге пусто (часто сохраняли только «Сохранить песню» в студии). */
export async function findBestStudioContentForCatalog(
  songId: number,
): Promise<{ content: string; custom_key: string | null } | null> {
  const result = await query(
    `SELECT custom_content, custom_key
     FROM studio_versions
     WHERE song_id = $1
       AND btrim(coalesce(custom_content, '')) <> ''
     ORDER BY length(custom_content) DESC, updated_at DESC
     LIMIT 1`,
    [songId],
  );
  const row = result.rows[0] as { custom_content?: string; custom_key?: string | null } | undefined;
  if (!row?.custom_content?.trim()) return null;
  return {
    content: String(row.custom_content).trimEnd(),
    custom_key: row.custom_key != null ? String(row.custom_key) : null,
  };
}

/**
 * Перенос готовой песни в общий каталог (песенник) — для любого автора.
 * Уже опубликованные не трогаем (личная студийная версия).
 */
export async function promoteReadySongToCatalog(
  songId: number,
  content: string,
  customKey?: string | null,
): Promise<SongRow | null> {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const r = await query(`SELECT tags, is_published FROM songs WHERE id = $1`, [songId]);
  const row = r.rows[0] as { tags?: string[]; is_published?: boolean } | undefined;
  if (!row || row.is_published) return null;

  const tags = Array.isArray(row.tags) ? row.tags.map((t) => String(t)) : [];
  if (!isCatalogReady(trimmed, tags)) return null;

  const cleanTags = stripImportSandboxTags(tags);

  const result = await query(
    `UPDATE songs
     SET content = $2,
         default_key = COALESCE($3, default_key),
         is_published = TRUE,
         tags = $4::text[],
         updated_at = NOW()
     WHERE id = $1
       AND NOT is_published
     RETURNING *`,
    [songId, trimmed, customKey ?? null, cleanTags],
  );
  return result.rows[0] ? mapSong(result.rows[0] as Record<string, unknown>) : null;
}

/** @deprecated Используйте promoteReadySongToCatalog */
export const promoteImportedSandboxToCatalog = promoteReadySongToCatalog;

/** Публикация в общий каталог: is_published = true, убираем технические теги импорта. */
export async function publishSongToCatalog(
  id: number,
  authorMemberId?: number,
): Promise<SongRow | null> {
  const existing = await query(
    `SELECT content, tags FROM songs WHERE id = $1 LIMIT 1`,
    [id],
  );
  const row = existing.rows[0] as { content?: string; tags?: string[] } | undefined;
  let content = String(row?.content ?? '').trim();
  let customKey: string | null = null;

  if (!content && authorMemberId != null) {
    const authorVersion = await query(
      `SELECT custom_content, custom_key
       FROM studio_versions
       WHERE song_id = $1 AND member_id = $2
         AND btrim(coalesce(custom_content, '')) <> ''`,
      [id, authorMemberId],
    );
    const av = authorVersion.rows[0] as { custom_content?: string; custom_key?: string | null } | undefined;
    if (av?.custom_content?.trim()) {
      content = String(av.custom_content).trimEnd();
      customKey = av.custom_key != null ? String(av.custom_key) : null;
    }
  }

  if (!content) {
    const fromStudio = await findBestStudioContentForCatalog(id);
    if (fromStudio) {
      content = fromStudio.content;
      customKey = fromStudio.custom_key;
    }
  }

  const tags = Array.isArray(row?.tags) ? row.tags.map((t) => String(t)) : [];
  const cleanTags = stripImportSandboxTags(tags);

  const result = await query(
    `UPDATE songs
     SET is_published = TRUE,
         content = CASE WHEN btrim(coalesce(content, '')) = '' AND $2::text <> '' THEN $2 ELSE content END,
         default_key = COALESCE($3, default_key),
         tags = $4::text[],
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, content, customKey, cleanTags],
  );
  return result.rows[0] ? mapSong(result.rows[0] as Record<string, unknown>) : null;
}

/** @deprecated Используйте publishSongToCatalog */
export const publishImportedSong = publishSongToCatalog;

export type CatalogSyncResult = {
  published: number;
  contentSynced: number;
  songIds: number[];
};

/** Сколько песен участника ещё не видны всем в общем песеннике. */
export async function countMemberSongsHiddenFromPublicCatalog(memberId: number): Promise<number> {
  const r = await query(
    `SELECT COUNT(DISTINCT s.id)::int AS c
     FROM songs s
     LEFT JOIN studio_versions sv ON sv.song_id = s.id AND sv.member_id = $1
     WHERE (s.created_by_member_id = $1 OR sv.id IS NOT NULL)
       AND NOT (COALESCE(s.tags, '{}'::text[]) @> ARRAY['__archived']::text[])
       AND (
         NOT s.is_published
         OR (
           s.is_published = TRUE
           AND btrim(coalesce(s.content, '')) = ''
           AND btrim(coalesce(sv.custom_content, '')) <> ''
         )
       )`,
    [memberId],
  );
  return Number((r.rows[0] as { c?: number } | undefined)?.c ?? 0);
}

/**
 * Перенос готовых песен участника в общий песенник (видят все в /songbook).
 * — неопубликованные с текстом в songs;
 * — неопубликованные с текстом только в studio_versions;
 * — уже опубликованные, но с пустым songs.content (текст только в студии).
 */
export async function syncMemberSongsToPublicCatalog(memberId: number): Promise<CatalogSyncResult> {
  const songIds: number[] = [];
  let published = 0;

  const pubWithContent = await query(
    `UPDATE songs s
     SET is_published = TRUE,
         tags = COALESCE(
           (
             SELECT array_agg(t)
             FROM unnest(COALESCE(s.tags, '{}'::text[])) AS t
             WHERE t NOT IN ('импортированная', 'импортировано', 'нет_текста')
           ),
           '{}'::text[]
         ),
         updated_at = NOW()
     WHERE s.created_by_member_id = $1
       AND NOT s.is_published
       AND btrim(coalesce(s.content, '')) <> ''
       AND NOT (COALESCE(s.tags, '{}'::text[]) @> ARRAY['нет_текста']::text[])
       AND NOT (COALESCE(s.tags, '{}'::text[]) @> ARRAY['__archived']::text[])
     RETURNING id`,
    [memberId],
  );
  for (const row of pubWithContent.rows as { id: string }[]) {
    songIds.push(Number(row.id));
  }
  published += pubWithContent.rowCount ?? 0;

  const tagSql = sqlImportedSandboxTagsMatch();
  const studioCandidates = await query(
    `SELECT DISTINCT s.id::bigint AS id
     FROM songs s
     INNER JOIN studio_versions sv ON sv.song_id = s.id AND sv.member_id = $1
     WHERE NOT s.is_published
       AND btrim(coalesce(sv.custom_content, '')) <> ''
       AND NOT (COALESCE(s.tags, '{}'::text[]) @> ARRAY['__archived']::text[])
       AND (s.created_by_member_id = $1 OR (${tagSql}))`,
    [memberId],
  );

  for (const row of studioCandidates.rows as { id: string }[]) {
    const sid = Number(row.id);
    if (songIds.includes(sid)) continue;
    const result = await publishSongToCatalog(sid, memberId);
    if (result) {
      published += 1;
      songIds.push(sid);
    }
  }

  const syncContent = await query(
    `UPDATE songs s
     SET content = sub.content,
         default_key = COALESCE(sub.custom_key, s.default_key),
         tags = COALESCE(
           (
             SELECT array_agg(t)
             FROM unnest(COALESCE(s.tags, '{}'::text[])) AS t
             WHERE t NOT IN ('импортированная', 'импортировано', 'нет_текста')
           ),
           '{}'::text[]
         ),
         updated_at = NOW()
     FROM (
       SELECT DISTINCT ON (sv.song_id)
         sv.song_id,
         sv.custom_content AS content,
         sv.custom_key
       FROM studio_versions sv
       WHERE sv.member_id = $1
         AND btrim(coalesce(sv.custom_content, '')) <> ''
       ORDER BY sv.song_id, length(sv.custom_content) DESC, sv.updated_at DESC
     ) sub
     WHERE s.id = sub.song_id
       AND s.is_published = TRUE
       AND btrim(coalesce(s.content, '')) = ''
     RETURNING s.id`,
    [memberId],
  );
  const contentSynced = syncContent.rowCount ?? 0;
  for (const row of syncContent.rows as { id: string }[]) {
    const sid = Number(row.id);
    if (!songIds.includes(sid)) songIds.push(sid);
  }

  return { published, contentSynced, songIds };
}

/** Сколько песен во всём проекте ещё не в общем каталоге (любой автор). */
export async function countSongsHiddenFromPublicCatalog(): Promise<number> {
  const r = await query(
    `SELECT COUNT(*)::int AS c
     FROM songs s
     WHERE NOT (COALESCE(s.tags, '{}'::text[]) @> ARRAY['__archived']::text[])
       AND (
         (
           NOT s.is_published
           AND (
             (
               btrim(coalesce(s.content, '')) <> ''
               AND NOT (COALESCE(s.tags, '{}'::text[]) @> ARRAY['нет_текста']::text[])
             )
             OR EXISTS (
               SELECT 1 FROM studio_versions sv
               WHERE sv.song_id = s.id
                 AND btrim(coalesce(sv.custom_content, '')) <> ''
             )
           )
         )
         OR (
           s.is_published = TRUE
           AND btrim(coalesce(s.content, '')) = ''
           AND EXISTS (
             SELECT 1 FROM studio_versions sv
             WHERE sv.song_id = s.id
               AND btrim(coalesce(sv.custom_content, '')) <> ''
           )
         )
       )`,
  );
  return Number((r.rows[0] as { c?: number } | undefined)?.c ?? 0);
}

/**
 * Массовая публикация готовых песен всех авторов в общий каталог.
 * — текст в songs.content;
 * — текст только в studio_versions (любой участник);
 * — уже опубликованные с пустым content.
 */
export async function syncAllSongsToPublicCatalog(): Promise<CatalogSyncResult> {
  const songIds: number[] = [];
  let published = 0;

  const pubWithContent = await query(
    `UPDATE songs s
     SET is_published = TRUE,
         tags = COALESCE(
           (
             SELECT array_agg(t)
             FROM unnest(COALESCE(s.tags, '{}'::text[])) AS t
             WHERE t NOT IN ('импортированная', 'импортировано', 'нет_текста')
           ),
           '{}'::text[]
         ),
         updated_at = NOW()
     WHERE NOT s.is_published
       AND btrim(coalesce(s.content, '')) <> ''
       AND NOT (COALESCE(s.tags, '{}'::text[]) @> ARRAY['нет_текста']::text[])
       AND NOT (COALESCE(s.tags, '{}'::text[]) @> ARRAY['__archived']::text[])
     RETURNING id`,
  );
  for (const row of pubWithContent.rows as { id: string }[]) {
    songIds.push(Number(row.id));
  }
  published += pubWithContent.rowCount ?? 0;

  const fromStudio = await query(
    `UPDATE songs s
     SET content = sub.content,
         default_key = COALESCE(sub.custom_key, s.default_key),
         is_published = TRUE,
         tags = COALESCE(
           (
             SELECT array_agg(t)
             FROM unnest(COALESCE(s.tags, '{}'::text[])) AS t
             WHERE t NOT IN ('импортированная', 'импортировано', 'нет_текста')
           ),
           '{}'::text[]
         ),
         updated_at = NOW()
     FROM (
       SELECT DISTINCT ON (sv.song_id)
         sv.song_id,
         sv.custom_content AS content,
         sv.custom_key
       FROM studio_versions sv
       WHERE btrim(coalesce(sv.custom_content, '')) <> ''
       ORDER BY sv.song_id, length(sv.custom_content) DESC, sv.updated_at DESC
     ) sub
     WHERE s.id = sub.song_id
       AND NOT s.is_published
       AND btrim(coalesce(s.content, '')) = ''
       AND NOT (COALESCE(s.tags, '{}'::text[]) @> ARRAY['__archived']::text[])
     RETURNING s.id`,
  );
  for (const row of fromStudio.rows as { id: string }[]) {
    const sid = Number(row.id);
    if (!songIds.includes(sid)) songIds.push(sid);
  }
  published += fromStudio.rowCount ?? 0;

  const syncContent = await query(
    `UPDATE songs s
     SET content = sub.content,
         default_key = COALESCE(sub.custom_key, s.default_key),
         tags = COALESCE(
           (
             SELECT array_agg(t)
             FROM unnest(COALESCE(s.tags, '{}'::text[])) AS t
             WHERE t NOT IN ('импортированная', 'импортировано', 'нет_текста')
           ),
           '{}'::text[]
         ),
         updated_at = NOW()
     FROM (
       SELECT DISTINCT ON (sv.song_id)
         sv.song_id,
         sv.custom_content AS content,
         sv.custom_key
       FROM studio_versions sv
       WHERE btrim(coalesce(sv.custom_content, '')) <> ''
       ORDER BY sv.song_id, length(sv.custom_content) DESC, sv.updated_at DESC
     ) sub
     WHERE s.id = sub.song_id
       AND s.is_published = TRUE
       AND btrim(coalesce(s.content, '')) = ''
     RETURNING s.id`,
  );
  const contentSynced = syncContent.rowCount ?? 0;
  for (const row of syncContent.rows as { id: string }[]) {
    const sid = Number(row.id);
    if (!songIds.includes(sid)) songIds.push(sid);
  }

  return { published, contentSynced, songIds };
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
     SELECT $1, s.id, NOW()
     FROM songs s
     WHERE s.id = $2
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
