import { query } from '../config/db';

export type NoteKind = 'urgent_prayer' | 'announcement';
export type DurationPreset = 'day' | 'week' | 'month';

function fromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map((x) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error('Invalid YYYY-MM-DD');
  }
  return new Date(y, m - 1, d);
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** Конец календарной недели (пн–вс): воскресенье недели, в которую попадает день. */
function sundayOfCalendarWeekContaining(d: Date): Date {
  const day = d.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - daysFromMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}

export function endDateForDuration(todayYmd: string, duration: DurationPreset): string {
  const t = fromYmd(todayYmd);
  if (duration === 'day') return todayYmd;
  if (duration === 'week') {
    return toYmd(sundayOfCalendarWeekContaining(t));
  }
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0);
  return toYmd(last);
}

export interface CoordinatorNotePublic {
  text: string;
  start_date: string;
  end_date: string;
}

export async function getCoordinatorNotesVisibleOnDate(viewDateYmd: string): Promise<{
  urgent_prayer: CoordinatorNotePublic | null;
  announcement: CoordinatorNotePublic | null;
}> {
  const result = await query(
    `SELECT kind, body, start_date, end_date
     FROM dashboard_coordinator_notes
     WHERE $1::date BETWEEN start_date AND end_date
       AND length(trim(body)) > 0`,
    [viewDateYmd]
  );

  let urgent_prayer: CoordinatorNotePublic | null = null;
  let announcement: CoordinatorNotePublic | null = null;
  for (const row of result.rows as Array<{
    kind: string;
    body: string;
    start_date: string;
    end_date: string;
  }>) {
    const item: CoordinatorNotePublic = {
      text: String(row.body ?? '').trim(),
      start_date: String(row.start_date),
      end_date: String(row.end_date),
    };
    if (row.kind === 'urgent_prayer') urgent_prayer = item;
    if (row.kind === 'announcement') announcement = item;
  }
  return { urgent_prayer, announcement };
}

/** Все непустые записи (без фильтра по дате) — для редактирования координатором. */
export async function getCoordinatorNotesManageSnapshot(): Promise<{
  urgent_prayer: CoordinatorNotePublic | null;
  announcement: CoordinatorNotePublic | null;
}> {
  const result = await query(
    `SELECT kind, body, start_date, end_date
     FROM dashboard_coordinator_notes
     WHERE length(trim(body)) > 0`
  );

  let urgent_prayer: CoordinatorNotePublic | null = null;
  let announcement: CoordinatorNotePublic | null = null;
  for (const row of result.rows as Array<{
    kind: string;
    body: string;
    start_date: string;
    end_date: string;
  }>) {
    const item: CoordinatorNotePublic = {
      text: String(row.body ?? '').trim(),
      start_date: String(row.start_date),
      end_date: String(row.end_date),
    };
    if (row.kind === 'urgent_prayer') urgent_prayer = item;
    if (row.kind === 'announcement') announcement = item;
  }
  return { urgent_prayer, announcement };
}

export async function deleteCoordinatorNote(kind: NoteKind): Promise<void> {
  await query(`DELETE FROM dashboard_coordinator_notes WHERE kind = $1`, [kind]);
}

export async function upsertCoordinatorNote(
  memberId: number,
  kind: NoteKind,
  body: string,
  duration: DurationPreset,
  todayYmd: string
): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) {
    await query(`DELETE FROM dashboard_coordinator_notes WHERE kind = $1`, [kind]);
    return;
  }
  const end = endDateForDuration(todayYmd, duration);
  await query(
    `INSERT INTO dashboard_coordinator_notes (kind, body, start_date, end_date, updated_by_member_id, updated_at)
     VALUES ($1, $2, $3::date, $4::date, $5, NOW())
     ON CONFLICT (kind) DO UPDATE SET
       body = EXCLUDED.body,
       start_date = EXCLUDED.start_date,
       end_date = EXCLUDED.end_date,
       updated_by_member_id = EXCLUDED.updated_by_member_id,
       updated_at = NOW()`,
    [kind, trimmed, todayYmd, end, memberId]
  );
}

export async function memberIsAdminOrCollectionCoordinator(memberId: number): Promise<boolean> {
  const r = await query(
    `SELECT app_role, is_collection_coordinator FROM members WHERE id = $1`,
    [memberId]
  );
  const row = r.rows[0] as { app_role: string | null; is_collection_coordinator: boolean | null } | undefined;
  if (!row) return false;
  if (String(row.app_role ?? '').trim().toLowerCase() === 'admin') return true;
  return Boolean(row.is_collection_coordinator);
}
