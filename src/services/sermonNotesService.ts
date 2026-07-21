import { query } from '../config/db';

export interface SermonNoteListItem {
  id: string;
  member_id: number;
  title: string;
  topic: string;
  scripture: string;
  updated_at: string;
  created_at: string;
  service_plan_id: number | null;
}

export interface SermonNoteRow extends SermonNoteListItem {
  body: string;
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
    service_plan_id:
      planRaw == null || planRaw === '' ? null : Number(planRaw),
  };
}

function mapFullRow(r: Record<string, unknown>): SermonNoteRow {
  return {
    ...mapListRow(r),
    body: String(r.body ?? ''),
  };
}

export async function listSermonNotes(memberId: number): Promise<SermonNoteListItem[]> {
  const result = await query(
    `SELECT id, member_id, title, topic, scripture, service_plan_id, created_at, updated_at
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
  input: { title?: string; topic?: string; scripture?: string; body?: string } = {},
): Promise<SermonNoteRow> {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const topic = typeof input.topic === 'string' ? input.topic.trim() : '';
  const scripture = typeof input.scripture === 'string' ? input.scripture.trim() : '';
  const body = typeof input.body === 'string' ? input.body : '';
  const result = await query(
    `INSERT INTO sermon_notes (member_id, title, topic, scripture, body, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING *`,
    [memberId, title, topic, scripture, body],
  );
  return mapFullRow(result.rows[0] as Record<string, unknown>);
}

export async function updateSermonNote(
  memberId: number,
  noteId: number,
  input: { title?: string; topic?: string; scripture?: string; body?: string },
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
