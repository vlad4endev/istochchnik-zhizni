import { query } from '../config/db';
import { getNextWeekDates } from './calendarService';

export interface CollectionPickMember {
  id: number;
  name: string;
}

export interface CollectionDayPick {
  date: string;
  selected_member: CollectionPickMember | null;
}

export interface CoordinatorRow {
  coordinator: { id: number; name: string };
  days: CollectionDayPick[];
  can_edit: boolean;
}

export interface NextWeekCollectionSnapshot {
  week_start: string;
  day_dates: string[];
  coordinator_rows: CoordinatorRow[];
  members_for_select: { id: number; name: string }[];
}

export async function getNextWeekCollectionSnapshot(
  authUserId: number | null
): Promise<NextWeekCollectionSnapshot> {
  const dayDates = getNextWeekDates();
  const weekStart = dayDates[0];

  const coordinatorsResult = await query(
    `SELECT id, name FROM members
     WHERE is_active = TRUE AND is_collection_coordinator = TRUE
     ORDER BY id ASC`
  );

  const coordinators = coordinatorsResult.rows as { id: number; name: string }[];

  const picksResult = await query(
    `SELECT coordinator_id, day_date::text AS day_date, selected_member_id
     FROM next_week_collection_picks
     WHERE week_start = $1::date`,
    [weekStart]
  );

  const pickMap = new Map<string, number | null>();
  for (const row of picksResult.rows as {
    coordinator_id: number;
    day_date: string;
    selected_member_id: number | null;
  }[]) {
    pickMap.set(`${row.coordinator_id}_${row.day_date}`, row.selected_member_id);
  }

  const membersResult = await query(
    `SELECT id, name FROM members WHERE is_active = TRUE
     ORDER BY
       LOWER(COALESCE(NULLIF(trim(last_name), ''), split_part(trim(name), ' ', 1))) ASC,
       LOWER(COALESCE(NULLIF(trim(first_name), ''), name)) ASC,
       id ASC`
  );

  const allMembers = membersResult.rows as { id: number; name: string }[];
  const memberById = new Map(allMembers.map((m) => [m.id, m]));

  const coordinator_rows: CoordinatorRow[] = coordinators.map((c) => ({
    coordinator: { id: c.id, name: c.name },
    days: dayDates.map((date) => {
      const mid = pickMap.get(`${c.id}_${date}`) ?? null;
      const selected =
        mid != null && memberById.has(mid) ? { id: mid, name: memberById.get(mid)!.name } : null;
      return { date, selected_member: selected };
    }),
    can_edit: authUserId != null && authUserId === c.id,
  }));

  return {
    week_start: weekStart,
    day_dates: dayDates,
    coordinator_rows,
    members_for_select: allMembers,
  };
}

/**
 * Сохранить назначения координатора на текущую «следующую неделю».
 * @throws Error с кодом в message: not_coordinator | invalid_date | invalid_member
 */
export async function upsertCoordinatorPicks(
  coordinatorId: number,
  picks: Record<string, number | null>
): Promise<void> {
  const dayDates = getNextWeekDates();
  const weekStart = dayDates[0];
  const allowed = new Set(dayDates);

  const coordCheck = await query(
    `SELECT 1 FROM members
     WHERE id = $1 AND is_active = TRUE AND is_collection_coordinator = TRUE
     LIMIT 1`,
    [coordinatorId]
  );
  if ((coordCheck.rowCount ?? 0) === 0) {
    throw new Error('not_coordinator');
  }

  for (const dateStr of Object.keys(picks)) {
    if (!allowed.has(dateStr)) {
      throw new Error('invalid_date');
    }
  }

  for (const dateStr of dayDates) {
    if (!(dateStr in picks)) {
      throw new Error('invalid_date');
    }
  }

  for (const dateStr of dayDates) {
    const memberId = picks[dateStr];
    if (memberId != null) {
      const m = await query(`SELECT 1 FROM members WHERE id = $1 AND is_active = TRUE LIMIT 1`, [
        memberId,
      ]);
      if ((m.rowCount ?? 0) === 0) {
        throw new Error('invalid_member');
      }
    }
  }

  await query(`DELETE FROM next_week_collection_picks WHERE coordinator_id = $1 AND week_start = $2::date`, [
    coordinatorId,
    weekStart,
  ]);

  const placeholders: string[] = [];
  const vals: unknown[] = [];
  let p = 1;
  for (const dateStr of dayDates) {
    const mid = picks[dateStr];
    placeholders.push(`($${p}, $${p + 1}::date, $${p + 2}::date, $${p + 3}, NOW())`);
    vals.push(coordinatorId, weekStart, dateStr, mid);
    p += 4;
  }

  await query(
    `INSERT INTO next_week_collection_picks (coordinator_id, week_start, day_date, selected_member_id, updated_at)
     VALUES ${placeholders.join(', ')}`,
    vals
  );
}
