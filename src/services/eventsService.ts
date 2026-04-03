import { query } from '../config/db';

export interface ChurchEvent {
  id: number;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string;
  recurrence_type: 'once' | 'weekly';
  weekly_day: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function listActiveEvents(): Promise<ChurchEvent[]> {
  const result = await query(
    `SELECT
      id,
      title,
      description,
      event_date::text AS event_date,
      to_char(event_time, 'HH24:MI') AS event_time,
      recurrence_type,
      weekly_day,
      is_active,
      created_at::text AS created_at,
      updated_at::text AS updated_at
     FROM church_events
     WHERE is_active = TRUE
     ORDER BY event_date ASC, event_time ASC, id ASC`,
  );
  return result.rows as ChurchEvent[];
}

export async function listAllEventsAdmin(): Promise<ChurchEvent[]> {
  const result = await query(
    `SELECT
      id,
      title,
      description,
      event_date::text AS event_date,
      to_char(event_time, 'HH24:MI') AS event_time,
      recurrence_type,
      weekly_day,
      is_active,
      created_at::text AS created_at,
      updated_at::text AS updated_at
     FROM church_events
     ORDER BY event_date ASC, event_time ASC, id ASC`,
  );
  return result.rows as ChurchEvent[];
}

export async function createChurchEvent(input: {
  title: string;
  description?: string | null;
  event_date: string;
  event_time: string;
  recurrence_type: 'once' | 'weekly';
  weekly_day?: number | null;
  is_active?: boolean;
}): Promise<ChurchEvent> {
  const result = await query(
    `INSERT INTO church_events (title, description, event_date, event_time, recurrence_type, weekly_day, is_active)
     VALUES ($1, $2, $3::date, $4::time, $5, $6, COALESCE($7, TRUE))
     RETURNING
       id,
       title,
       description,
       event_date::text AS event_date,
       to_char(event_time, 'HH24:MI') AS event_time,
       recurrence_type,
       weekly_day,
       is_active,
       created_at::text AS created_at,
       updated_at::text AS updated_at`,
    [
      input.title.trim(),
      typeof input.description === 'string' && input.description.trim().length > 0
        ? input.description.trim()
        : null,
      input.event_date,
      input.event_time,
      input.recurrence_type,
      input.weekly_day ?? null,
      input.is_active ?? true,
    ],
  );
  return result.rows[0] as ChurchEvent;
}

export async function updateChurchEvent(
  id: number,
  input: Partial<{
    title: string;
    description: string | null;
    event_date: string;
    event_time: string;
    recurrence_type: 'once' | 'weekly';
    weekly_day: number | null;
    is_active: boolean;
  }>,
): Promise<ChurchEvent | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (typeof input.title === 'string') {
    updates.push(`title = $${i++}`);
    values.push(input.title.trim());
  }
  if (input.description !== undefined) {
    if (typeof input.description === 'string') {
      updates.push(`description = $${i++}`);
      values.push(input.description.trim() || null);
    } else {
      updates.push(`description = $${i++}`);
      values.push(null);
    }
  }
  if (typeof input.event_date === 'string') {
    updates.push(`event_date = $${i++}::date`);
    values.push(input.event_date);
  }
  if (typeof input.event_time === 'string') {
    updates.push(`event_time = $${i++}::time`);
    values.push(input.event_time);
  }
  if (typeof input.recurrence_type === 'string') {
    updates.push(`recurrence_type = $${i++}`);
    values.push(input.recurrence_type);
  }
  if (input.weekly_day !== undefined) {
    updates.push(`weekly_day = $${i++}`);
    values.push(input.weekly_day);
  }
  if (typeof input.is_active === 'boolean') {
    updates.push(`is_active = $${i++}`);
    values.push(input.is_active);
  }

  if (updates.length === 0) {
    const current = await query(
      `SELECT
        id,
        title,
        description,
        event_date::text AS event_date,
        to_char(event_time, 'HH24:MI') AS event_time,
        recurrence_type,
        weekly_day,
        is_active,
        created_at::text AS created_at,
        updated_at::text AS updated_at
       FROM church_events
       WHERE id = $1`,
      [id],
    );
    return (current.rows[0] as ChurchEvent | undefined) ?? null;
  }

  updates.push('updated_at = NOW()');
  values.push(id);
  const result = await query(
    `UPDATE church_events
     SET ${updates.join(', ')}
     WHERE id = $${values.length}
     RETURNING
       id,
       title,
       description,
       event_date::text AS event_date,
       to_char(event_time, 'HH24:MI') AS event_time,
       recurrence_type,
       weekly_day,
       is_active,
       created_at::text AS created_at,
       updated_at::text AS updated_at`,
    values,
  );
  return (result.rows[0] as ChurchEvent | undefined) ?? null;
}

export async function deleteChurchEvent(id: number): Promise<boolean> {
  const result = await query('DELETE FROM church_events WHERE id = $1 RETURNING id', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function deleteAllChurchEvents(): Promise<number> {
  const result = await query('DELETE FROM church_events');
  return result.rowCount ?? 0;
}
