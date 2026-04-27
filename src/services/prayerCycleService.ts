import { query } from '../config/db';
import { addUtcDaysToIsoDate, getDiffDays } from '../utils/isoDates';

/** Участники с этим флагом входят в расчёт длины цикла и очереди «день за днём». */
export const PRAYER_CYCLE_MEMBERS_WHERE = 'is_active = TRUE AND in_prayer_cycle = TRUE';
export const PRAYER_CYCLE_MEMBERS_WHERE_M = 'm.is_active = TRUE AND m.in_prayer_cycle = TRUE';

/** Совпадает с get_daily_prayer и триггером reset_cycle_on_member_change (ORDER BY members). */
export const PRAYER_CYCLE_ROSTER_ORDER_SQL = `LOWER(COALESCE(NULLIF(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1))) ASC,
    LOWER(COALESCE(NULLIF(trim(m.first_name), ''), m.name)) ASC,
    m.id ASC`;

/** Метаданные молитвенного цикла: полный проход по активным участникам (M дней). */
export interface PrayerCycleSnapshot {
  /** 0-based индекс цикла относительно start_date */
  cycle_index: number;
  /** Номер цикла для отображения (1-based) */
  cycle_number: number;
  member_count: number;
  start_date: string;
  end_date: string;
  /** Позиция внутри цикла 0..M-1 (совпадает с индексом «дня очереди») */
  day_index: number;
  diff_days: number;
}

export interface PrayerCyclePublic {
  index: number;
  number: number;
  member_count: number;
  start_date: string;
  end_date: string;
  day_index: number;
}

export async function getCycleStartDate(): Promise<string> {
  await query(
    `INSERT INTO global_settings (id, start_date)
     VALUES (1, CURRENT_DATE)
     ON CONFLICT (id) DO NOTHING`
  );

  const result = await query('SELECT start_date::text FROM global_settings WHERE id = 1');

  return (result.rows[0] as { start_date?: string } | undefined)?.start_date ??
    new Date().toISOString().slice(0, 10);
}

export async function getActiveMemberCount(): Promise<number> {
  const result = await query(
    `SELECT COUNT(*)::int AS c FROM members WHERE ${PRAYER_CYCLE_MEMBERS_WHERE}`,
  );
  return result.rows[0]?.c ?? 0;
}

export function computeCycleIndex(diffDays: number, memberCount: number): number {
  if (memberCount <= 0) {
    return 0;
  }
  return Math.floor(diffDays / memberCount);
}

export function dayIndexInCycle(diffDays: number, memberCount: number): number {
  if (memberCount <= 0) {
    return 0;
  }
  return ((diffDays % memberCount) + memberCount) % memberCount;
}

export async function getPrayerCycleSnapshotForDate(targetDateIso: string): Promise<PrayerCycleSnapshot | null> {
  const start = await getCycleStartDate();
  const memberCount = await getActiveMemberCount();
  if (memberCount <= 0) {
    return null;
  }

  const diffDays = getDiffDays(targetDateIso, start);
  const cycleIndex = computeCycleIndex(diffDays, memberCount);
  const dayIndex = dayIndexInCycle(diffDays, memberCount);
  const rangeStart = addUtcDaysToIsoDate(start, cycleIndex * memberCount);
  const rangeEnd = addUtcDaysToIsoDate(start, (cycleIndex + 1) * memberCount - 1);

  return {
    cycle_index: cycleIndex,
    cycle_number: cycleIndex + 1,
    member_count: memberCount,
    start_date: rangeStart,
    end_date: rangeEnd,
    day_index: dayIndex,
    diff_days: diffDays,
  };
}

export function toPublicCycleInfo(s: PrayerCycleSnapshot): PrayerCyclePublic {
  return {
    index: s.cycle_index,
    number: s.cycle_number,
    member_count: s.member_count,
    start_date: s.start_date,
    end_date: s.end_date,
    day_index: s.day_index,
  };
}

export async function getCurrentCycleIndexForUpsert(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const snap = await getPrayerCycleSnapshotForDate(today);
  return snap?.cycle_index ?? 0;
}

export async function upsertMemberPrayerForCycle(
  memberId: number,
  cycleIndex: number,
  prayerRequest: string | null
): Promise<void> {
  await query(
    `INSERT INTO member_prayer_by_cycle (member_id, cycle_index, prayer_request, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (member_id, cycle_index)
     DO UPDATE SET prayer_request = EXCLUDED.prayer_request, updated_at = NOW()`,
    [memberId, cycleIndex, prayerRequest]
  );
}

/** Слияние: сначала порядок из сохранёнки (только актуальные id), затем остальные из alpha по А–Я. */
export function mergePrayerCycleRosterOrderIds(
  alphaIds: readonly number[],
  stored: readonly number[] | null,
): number[] {
  if (!stored?.length) {
    return [...alphaIds];
  }
  const alphaSet = new Set(alphaIds);
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of stored) {
    if (alphaSet.has(id) && !seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  for (const id of alphaIds) {
    if (!seen.has(id)) {
      out.push(id);
    }
  }
  return out;
}

export async function getAlphaPrayerCycleRosterMemberIds(): Promise<number[]> {
  const rosterRes = await query(
    `SELECT m.id
     FROM members m
     WHERE ${PRAYER_CYCLE_MEMBERS_WHERE_M}
     ORDER BY ${PRAYER_CYCLE_ROSTER_ORDER_SQL}`,
  );
  return rosterRes.rows.map((row) => Number((row as { id: unknown }).id));
}

export async function getPrayerCycleCustomOrderMemberIds(cycleIndex: number): Promise<number[] | null> {
  const r = await query(
    `SELECT member_ids FROM prayer_cycle_roster_custom_order WHERE cycle_index = $1`,
    [cycleIndex],
  );
  const raw = (r.rows[0] as { member_ids?: unknown } | undefined)?.member_ids;
  if (!raw || !Array.isArray(raw)) {
    return null;
  }
  const ids = raw.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
  return ids.length ? ids : null;
}

export async function upsertPrayerCycleRosterCustomOrder(
  cycleIndex: number,
  memberIds: number[],
): Promise<void> {
  await query(
    `INSERT INTO prayer_cycle_roster_custom_order (cycle_index, member_ids, updated_at)
     VALUES ($1, $2::integer[], NOW())
     ON CONFLICT (cycle_index)
     DO UPDATE SET member_ids = EXCLUDED.member_ids, updated_at = NOW()`,
    [cycleIndex, memberIds],
  );
}

export async function getMergedPrayerCycleRosterMemberIdsForCycleIndex(
  cycleIndex: number,
): Promise<number[]> {
  const alphaIds = await getAlphaPrayerCycleRosterMemberIds();
  const custom = await getPrayerCycleCustomOrderMemberIds(cycleIndex);
  return mergePrayerCycleRosterOrderIds(alphaIds, custom);
}
