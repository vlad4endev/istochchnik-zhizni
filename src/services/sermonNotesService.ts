import { query } from '../config/db';

const PUBLIC_SHARE_TOKEN_MAX_AGE_DAYS = Math.min(
  3650,
  Math.max(1, Math.floor(Number(process.env.PUBLIC_SHARE_TOKEN_MAX_AGE_DAYS ?? '365') || 365)),
);

export type SermonNoteBodyFormat = 'plain' | 'html';

export interface SermonNoteListItem {
  id: string;
  member_id: number;
  title: string;
  topic: string;
  scripture: string;
  updated_at: string;
  created_at: string;
  service_plan_id: number | null;
  is_public: boolean;
  body_format: SermonNoteBodyFormat;
}

export interface SermonNoteRow extends SermonNoteListItem {
  body: string;
  share_token: string;
  share_token_issued_at: string;
}

export interface PublicSermonNote {
  id: string;
  title: string;
  topic: string;
  scripture: string;
  body: string;
  body_format: SermonNoteBodyFormat;
  updated_at: string;
  author_name: string | null;
}

function normalizeBodyFormat(raw: unknown): SermonNoteBodyFormat {
  return String(raw ?? '').toLowerCase() === 'html' ? 'html' : 'plain';
}

function mapListRow(r: Record<string, unknown>): SermonNoteListItem {
  const planRaw = r.service_plan_id;
  return {
    id: String(r.id),
    member_id: Number(r.member_id),
    title: String(r.title ?? ''),
    topic: String(r.topic ?? ''),
    scripture: String(r.scripture ?? ''),
    updated_at: String(r.updated_at),
    created_at: String(r.created_at),
    service_plan_id: planRaw == null || planRaw === '' ? null : Number(planRaw),
    is_public: Boolean(r.is_public),
    body_format: normalizeBodyFormat(r.body_format),
  };
}

function mapFullRow(r: Record<string, unknown>): SermonNoteRow {
  return {
    ...mapListRow(r),
    body: String(r.body ?? ''),
    share_token: r.share_token != null ? String(r.share_token) : '',
    share_token_issued_at: String(r.share_token_issued_at ?? r.updated_at ?? ''),
  };
}

export async function listSermonNotes(memberId: number): Promise<SermonNoteListItem[]> {
  const result = await query(
    `SELECT id, member_id, title, topic, scripture, service_plan_id, created_at, updated_at,
            is_public, body_format
     FROM sermon_notes
     WHERE member_id = $1
     ORDER BY updated_at DESC`,
    [memberId],
  );
  return result.rows.map((row) => mapListRow(row as Record<string, unknown>));
}

export async function getSermonNote(
  memberId: number,
  noteId: number,
): Promise<SermonNoteRow | null> {
  const result = await query(
    `SELECT * FROM sermon_notes WHERE id = $1 AND member_id = $2`,
    [noteId, memberId],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapFullRow(row) : null;
}

export async function createSermonNote(
  memberId: number,
  input: {
    title?: string;
    topic?: string;
    scripture?: string;
    body?: string;
    body_format?: SermonNoteBodyFormat;
  } = {},
): Promise<SermonNoteRow> {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const topic = typeof input.topic === 'string' ? input.topic.trim() : '';
  const scripture = typeof input.scripture === 'string' ? input.scripture.trim() : '';
  const body = typeof input.body === 'string' ? input.body : '';
  const bodyFormat: SermonNoteBodyFormat = input.body_format === 'html' ? 'html' : 'html';
  const result = await query(
    `INSERT INTO sermon_notes (member_id, title, topic, scripture, body, body_format, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING *`,
    [memberId, title, topic, scripture, body, bodyFormat],
  );
  return mapFullRow(result.rows[0] as Record<string, unknown>);
}

export async function updateSermonNote(
  memberId: number,
  noteId: number,
  input: {
    title?: string;
    topic?: string;
    scripture?: string;
    body?: string;
    body_format?: SermonNoteBodyFormat;
  },
): Promise<SermonNoteRow | null> {
  const fields: string[] = [];
  const vals: unknown[] = [];
  let n = 0;
  const push = (col: string, v: unknown) => {
    n += 1;
    fields.push(`${col} = $${n}`);
    vals.push(v);
  };
  if (input.title !== undefined) push('title', input.title.trim());
  if (input.topic !== undefined) push('topic', input.topic.trim());
  if (input.scripture !== undefined) push('scripture', input.scripture.trim());
  if (input.body !== undefined) push('body', input.body);
  if (input.body_format !== undefined) {
    push('body_format', input.body_format === 'html' ? 'html' : 'plain');
  }
  if (fields.length === 0) {
    return getSermonNote(memberId, noteId);
  }
  fields.push('updated_at = NOW()');
  vals.push(noteId, memberId);
  const result = await query(
    `UPDATE sermon_notes SET ${fields.join(', ')} WHERE id = $${n + 1} AND member_id = $${n + 2} RETURNING *`,
    vals,
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapFullRow(row) : null;
}

export async function deleteSermonNote(memberId: number, noteId: number): Promise<boolean> {
  const result = await query(`DELETE FROM sermon_notes WHERE id = $1 AND member_id = $2`, [
    noteId,
    memberId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

export async function updateSermonNoteShare(
  memberId: number,
  noteId: number,
  input: { is_public: boolean; rotate_token?: boolean },
): Promise<SermonNoteRow | null> {
  const result = await query(
    `UPDATE sermon_notes
     SET is_public = $1,
         share_token = CASE
           WHEN $4::boolean THEN gen_random_uuid()
           ELSE COALESCE(share_token, gen_random_uuid())
         END,
         share_token_issued_at = CASE
           WHEN $1::boolean OR $4::boolean THEN NOW()
           ELSE share_token_issued_at
         END,
         updated_at = NOW()
     WHERE id = $2 AND member_id = $3
     RETURNING *`,
    [input.is_public, noteId, memberId, Boolean(input.rotate_token)],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapFullRow(row) : null;
}

export async function getPublicSermonNoteByToken(token: string): Promise<PublicSermonNote | null> {
  const t = token.trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(t)) {
    return null;
  }
  const result = await query(
    `SELECT n.id, n.title, n.topic, n.scripture, n.body, n.body_format, n.updated_at,
            COALESCE(
              NULLIF(TRIM(CONCAT_WS(' ', m.first_name, m.last_name)), ''),
              NULLIF(TRIM(m.name), '')
            ) AS author_name
     FROM sermon_notes n
     LEFT JOIN members m ON m.id = n.member_id
     WHERE n.share_token = $1::uuid
       AND n.is_public = TRUE
       AND n.share_token_issued_at >= NOW() - ($2::int * INTERVAL '1 day')
     LIMIT 1`,
    [t, PUBLIC_SHARE_TOKEN_MAX_AGE_DAYS],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    topic: String(row.topic ?? ''),
    scripture: String(row.scripture ?? ''),
    body: String(row.body ?? ''),
    body_format: normalizeBodyFormat(row.body_format),
    updated_at: String(row.updated_at),
    author_name: row.author_name != null ? String(row.author_name) : null,
  };
}
