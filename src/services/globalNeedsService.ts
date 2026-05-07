import { query } from '../config/db';
import { getNextWeekDates } from './calendarService';

export interface GlobalTheme {
  id: number;
  title: string;
  bible_verse: string | null;
  prayer_points: string | null;
}

export interface Ministry {
  id: number;
  title: string;
  prayer_points: string | null;
}

export interface Backslider {
  id: number;
  name: string;
}

export interface NextWeekGlobalAssignment {
  date: string;
  themes: GlobalTheme[];
  ministries: Ministry[];
  backslider: Backslider | null;
}

async function getCycleStartDate(): Promise<string> {
  await query(
    `INSERT INTO global_settings (id, start_date)
     VALUES (1, CURRENT_DATE)
     ON CONFLICT (id) DO NOTHING`
  );
  const result = await query('SELECT start_date::text FROM global_settings WHERE id = 1');
  return (result.rows[0] as { start_date?: string } | undefined)?.start_date ??
    new Date().toISOString().slice(0, 10);
}

function getDiffDays(targetDate: string, startDate: string): number {
  const start = new Date(startDate + 'T00:00:00Z');
  const target = new Date(targetDate + 'T00:00:00Z');
  return Math.round((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

async function getByIndex<T>(table: string, index: number, orderColumn = 'id'): Promise<T | null> {
  const allowedTables = new Set(['global_themes', 'ministries', 'backsliders']);
  const allowedOrderColumns = new Set(['id']);
  if (!allowedTables.has(table) || !allowedOrderColumns.has(orderColumn)) {
    // SECURITY FIX: явный whitelist для динамических SQL-идентификаторов (как в calendarService.getByIndex).
    throw new Error('Invalid table or order column');
  }
  const result = await query(
    `SELECT * FROM ${table} ORDER BY ${orderColumn} LIMIT 1 OFFSET $1`,
    [index]
  );
  return (result.rows[0] as T) ?? null;
}

function getByIndexRange<T>(rows: T[], startIndex: number, count: number, total: number): T[] {
  if (total <= 0 || count <= 0) return [];
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    const idx = ((startIndex + i) % total + total) % total;
    out.push(rows[idx]);
  }
  return out;
}

export async function listGlobalThemes(): Promise<GlobalTheme[]> {
  const result = await query(
    'SELECT id, title, bible_verse, prayer_points FROM global_themes ORDER BY id'
  );
  return result.rows as GlobalTheme[];
}

export async function createGlobalTheme(input: {
  title: string;
  bible_verse?: string | null;
  prayer_points?: string | null;
}): Promise<GlobalTheme> {
  const result = await query(
    `INSERT INTO global_themes (title, bible_verse, prayer_points)
     VALUES ($1, $2, $3)
     RETURNING id, title, bible_verse, prayer_points`,
    [
      input.title.trim(),
      input.bible_verse?.trim() || null,
      input.prayer_points?.trim() || null,
    ]
  );
  return result.rows[0] as GlobalTheme;
}

export async function updateGlobalTheme(
  id: number,
  input: { title?: string; bible_verse?: string | null; prayer_points?: string | null }
): Promise<GlobalTheme | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (input.title !== undefined) {
    updates.push(`title = $${i++}`);
    values.push(input.title.trim());
  }
  if (input.bible_verse !== undefined) {
    updates.push(`bible_verse = $${i++}`);
    values.push(input.bible_verse?.trim() || null);
  }
  if (input.prayer_points !== undefined) {
    updates.push(`prayer_points = $${i++}`);
    values.push(input.prayer_points?.trim() || null);
  }

  if (updates.length === 0) {
    const r = await query('SELECT id, title, bible_verse, prayer_points FROM global_themes WHERE id = $1', [id]);
    return (r.rows[0] as GlobalTheme) ?? null;
  }

  values.push(id);
  const result = await query(
    `UPDATE global_themes SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, title, bible_verse, prayer_points`,
    values
  );
  return (result.rows[0] as GlobalTheme) ?? null;
}

export async function deleteGlobalTheme(id: number): Promise<boolean> {
  const result = await query('DELETE FROM global_themes WHERE id = $1 RETURNING id', [id]);
  return result.rowCount !== null && result.rowCount > 0;
}

export async function listMinistries(): Promise<Ministry[]> {
  const result = await query(
    'SELECT id, title, prayer_points FROM ministries ORDER BY id'
  );
  return result.rows as Ministry[];
}

export async function createMinistry(input: {
  title: string;
  prayer_points?: string | null;
}): Promise<Ministry> {
  const result = await query(
    `INSERT INTO ministries (title, prayer_points)
     VALUES ($1, $2)
     RETURNING id, title, prayer_points`,
    [input.title.trim(), input.prayer_points?.trim() || null]
  );
  return result.rows[0] as Ministry;
}

export async function updateMinistry(
  id: number,
  input: { title?: string; prayer_points?: string | null }
): Promise<Ministry | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (input.title !== undefined) {
    updates.push(`title = $${i++}`);
    values.push(input.title.trim());
  }
  if (input.prayer_points !== undefined) {
    updates.push(`prayer_points = $${i++}`);
    values.push(input.prayer_points?.trim() || null);
  }

  if (updates.length === 0) {
    const r = await query('SELECT id, title, prayer_points FROM ministries WHERE id = $1', [id]);
    return (r.rows[0] as Ministry) ?? null;
  }

  values.push(id);
  const result = await query(
    `UPDATE ministries SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, title, prayer_points`,
    values
  );
  return (result.rows[0] as Ministry) ?? null;
}

export async function deleteMinistry(id: number): Promise<boolean> {
  const result = await query('DELETE FROM ministries WHERE id = $1 RETURNING id', [id]);
  return result.rowCount !== null && result.rowCount > 0;
}

export async function listBacksliders(): Promise<Backslider[]> {
  const result = await query('SELECT id, name FROM backsliders ORDER BY id');
  return result.rows as Backslider[];
}

export async function createBackslider(input: { name: string }): Promise<Backslider> {
  const result = await query(
    `INSERT INTO backsliders (name) VALUES ($1) RETURNING id, name`,
    [input.name.trim()]
  );
  return result.rows[0] as Backslider;
}

export async function updateBackslider(id: number, input: { name?: string }): Promise<Backslider | null> {
  if (input.name === undefined) {
    const r = await query('SELECT id, name FROM backsliders WHERE id = $1', [id]);
    return (r.rows[0] as Backslider) ?? null;
  }

  const result = await query(
    `UPDATE backsliders SET name = $1 WHERE id = $2 RETURNING id, name`,
    [input.name.trim(), id]
  );
  return (result.rows[0] as Backslider) ?? null;
}

export async function deleteBackslider(id: number): Promise<boolean> {
  const result = await query('DELETE FROM backsliders WHERE id = $1 RETURNING id', [id]);
  return result.rowCount !== null && result.rowCount > 0;
}

const THEMES_PER_DATE = 3;
const MINISTRIES_PER_DATE = 3;

export async function getNextWeekGlobalAssignments(): Promise<NextWeekGlobalAssignment[]> {
  const dates = getNextWeekDates();
  const cycleStartDate = await getCycleStartDate();

  const [themesRows, ministriesRows, backslidersCount] = await Promise.all([
    query('SELECT id, title, bible_verse, prayer_points FROM global_themes ORDER BY id'),
    query('SELECT id, title, prayer_points FROM ministries ORDER BY id'),
    query('SELECT COUNT(*)::int AS count FROM backsliders'),
  ]);

  const allThemes = themesRows.rows as GlobalTheme[];
  const allMinistries = ministriesRows.rows as Ministry[];
  const totalThemes = allThemes.length;
  const totalMinistries = allMinistries.length;
  const totalBacksliders = backslidersCount.rows[0]?.count ?? 0;

  const assignments: NextWeekGlobalAssignment[] = [];

  for (const date of dates) {
    const diffDays = getDiffDays(date, cycleStartDate);
    const themeIndex = totalThemes > 0 ? ((diffDays % totalThemes) + totalThemes) % totalThemes : 0;
    const ministryIndex = totalMinistries > 0 ? ((diffDays % totalMinistries) + totalMinistries) % totalMinistries : 0;
    const backsliderIndex = totalBacksliders > 0 ? ((diffDays % totalBacksliders) + totalBacksliders) % totalBacksliders : 0;

    const themes = getByIndexRange(allThemes, themeIndex, Math.min(THEMES_PER_DATE, totalThemes), totalThemes);
    const ministries = getByIndexRange(allMinistries, ministryIndex, Math.min(MINISTRIES_PER_DATE, totalMinistries), totalMinistries);
    const backslider = totalBacksliders > 0 ? await getByIndex<Backslider>('backsliders', backsliderIndex) : null;

    assignments.push({
      date,
      themes,
      ministries,
      backslider: backslider ?? null,
    });
  }

  return assignments;
}
