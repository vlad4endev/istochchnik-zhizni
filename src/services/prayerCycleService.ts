import { query } from '../config/db';
import { notifyRealtime } from '../realtime/notify';
import {
  addUtcDaysToIsoDate,
  getMondayBasedDayIndex,
  getPrayerCyclePosition,
} from '../utils/isoDates';
import { getPrayerCycleTodayYmd } from '../utils/prayerPlanTimeZone';

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

export function computeCycleIndex(cyclePosition: number, memberCount: number): number {
  if (memberCount <= 0) {
    return 0;
  }
  return Math.floor(cyclePosition / memberCount);
}

export function dayIndexInCycle(cyclePosition: number, memberCount: number): number {
  if (memberCount <= 0) {
    return 0;
  }
  return ((cyclePosition % memberCount) + memberCount) % memberCount;
}

export async function getPrayerCycleSnapshotForDate(targetDateIso: string): Promise<PrayerCycleSnapshot | null> {
  const start = await getCycleStartDate();
  const memberCount = await getActiveMemberCount();
  if (memberCount <= 0) {
    return null;
  }

  const cyclePosition = getPrayerCyclePosition(targetDateIso, start);
  const cycleIndex = computeCycleIndex(cyclePosition, memberCount);
  const dayIndex = dayIndexInCycle(cyclePosition, memberCount);
  const cycleEpochMonday = addUtcDaysToIsoDate(start, -getMondayBasedDayIndex(start));
  const rangeStart = addUtcDaysToIsoDate(cycleEpochMonday, cycleIndex * memberCount);
  const rangeEnd = addUtcDaysToIsoDate(cycleEpochMonday, (cycleIndex + 1) * memberCount - 1);

  return {
    cycle_index: cycleIndex,
    cycle_number: cycleIndex + 1,
    member_count: memberCount,
    start_date: rangeStart,
    end_date: rangeEnd,
    day_index: dayIndex,
    diff_days: cyclePosition,
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
  const snap = await getPrayerCycleSnapshotForDate(getPrayerCycleTodayYmd());
  return snap?.cycle_index ?? 0;
}

/**
 * Нужда только из `member_prayer_by_cycle` для привязанного `cycle_index`.
 * Без COALESCE с `members.prayer_request` — иначе после смены цикла в поле «текущего» цикла
 * остаётся текст прошлого.
 */
export const CYCLE_PRAYER_REQUEST_SELECT_SQL = `NULLIF(TRIM(mpc.prayer_request), '')`;

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

/** Перенос устаревшего `members.prayer_request` в журнал (без потери текста). */
async function archiveLegacyMemberPrayerRequestsToHistory(ciNow: number): Promise<number> {
  const archiveCycle = Math.max(ciNow - 1, 0);
  const result = await query(
    `INSERT INTO member_prayer_request_history (member_id, prayer_request, cycle_index, created_at)
     SELECT m.id,
            trim(m.prayer_request),
            $1,
            NOW()
       FROM members m
      WHERE NULLIF(trim(COALESCE(m.prayer_request, '')), '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
            FROM member_prayer_request_history h
           WHERE h.member_id = m.id
             AND h.cycle_index IS NOT DISTINCT FROM $1
             AND trim(h.prayer_request) = trim(m.prayer_request)
        )`,
    [archiveCycle],
  );
  await query(
    `UPDATE members
        SET prayer_request = NULL,
            updated_at = NOW()
      WHERE NULLIF(trim(COALESCE(prayer_request, '')), '') IS NOT NULL`,
  );
  return result.rowCount ?? 0;
}

/** Перед записью в mpc: устаревший текст из members.prayer_request — в журнал, не в /dev/null. */
export async function archiveMemberLegacyPrayerRequestColumn(
  memberId: number,
  cycleIndex: number,
): Promise<void> {
  const archiveCycle = Math.max(cycleIndex - 1, 0);
  await query(
    `INSERT INTO member_prayer_request_history (member_id, prayer_request, cycle_index, created_at)
     SELECT m.id,
            trim(m.prayer_request),
            $2,
            NOW()
       FROM members m
      WHERE m.id = $1
        AND NULLIF(trim(COALESCE(m.prayer_request, '')), '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
            FROM member_prayer_request_history h
           WHERE h.member_id = m.id
             AND h.cycle_index IS NOT DISTINCT FROM $2
             AND trim(h.prayer_request) = trim(m.prayer_request)
        )`,
    [memberId, archiveCycle],
  );
  await query(
    `UPDATE members SET prayer_request = NULL, updated_at = NOW() WHERE id = $1`,
    [memberId],
  );
}

const MPC_DELETE_ONLY_IF_ARCHIVED_SQL = `
  AND (
    NULLIF(trim(mpc.prayer_request), '') IS NULL
    OR EXISTS (
      SELECT 1
        FROM member_prayer_request_history h
       WHERE h.member_id = mpc.member_id
         AND h.cycle_index IS NOT DISTINCT FROM mpc.cycle_index
    )
  )`;

/**
 * Перенос нужд завершённых циклов в журнал; из member_prayer_by_cycle удаляем только уже
 * заархивированные строки (текст остаётся в member_prayer_request_history).
 */
export async function snapshotPastCyclePrayersToHistory(): Promise<number> {
  const todayYmd = getPrayerCycleTodayYmd();
  const snap = await getPrayerCycleSnapshotForDate(todayYmd);
  const ciNow = snap?.cycle_index ?? 0;
  const rangeStart = snap?.start_date ?? todayYmd;

  const result = await query(
    `INSERT INTO member_prayer_request_history (member_id, prayer_request, cycle_index, created_at)
     SELECT mpc.member_id,
            trim(mpc.prayer_request),
            mpc.cycle_index,
            mpc.updated_at
       FROM member_prayer_by_cycle mpc
      WHERE mpc.cycle_index < $1
        AND NULLIF(trim(mpc.prayer_request), '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
            FROM member_prayer_request_history h
           WHERE h.member_id = mpc.member_id
             AND h.cycle_index IS NOT DISTINCT FROM mpc.cycle_index
        )`,
    [ciNow],
  );
  let inserted = result.rowCount ?? 0;

  const staleCurrent = await query(
    `INSERT INTO member_prayer_request_history (member_id, prayer_request, cycle_index, created_at)
     SELECT mpc.member_id,
            trim(mpc.prayer_request),
            mpc.cycle_index,
            mpc.updated_at
       FROM member_prayer_by_cycle mpc
      WHERE mpc.cycle_index = $1
        AND mpc.updated_at::date < $2::date
        AND NULLIF(trim(mpc.prayer_request), '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
            FROM member_prayer_request_history h
           WHERE h.member_id = mpc.member_id
             AND h.cycle_index IS NOT DISTINCT FROM mpc.cycle_index
        )`,
    [ciNow, rangeStart],
  );
  inserted += staleCurrent.rowCount ?? 0;
  inserted += await archiveLegacyMemberPrayerRequestsToHistory(ciNow);

  const deletedPast = await query(
    `DELETE FROM member_prayer_by_cycle mpc
      WHERE mpc.cycle_index < $1
      ${MPC_DELETE_ONLY_IF_ARCHIVED_SQL}`,
    [ciNow],
  );
  const staleDeleted = await query(
    `DELETE FROM member_prayer_by_cycle mpc
      WHERE mpc.cycle_index = $1
        AND mpc.updated_at::date < $2::date
        ${MPC_DELETE_ONLY_IF_ARCHIVED_SQL}`,
    [ciNow, rangeStart],
  );
  if (inserted > 0 || (deletedPast.rowCount ?? 0) > 0 || (staleDeleted.rowCount ?? 0) > 0) {
    notifyRealtime(['members', 'calendar']);
  }
  return inserted;
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

/** Убрать участника из сохранённого порядка очереди во всех циклах. */
export async function removeMemberFromPrayerCycleCustomOrders(memberId: number): Promise<void> {
  await query(
    `UPDATE prayer_cycle_roster_custom_order
     SET member_ids = array_remove(member_ids, $1::int),
         updated_at = NOW()
     WHERE $1::int = ANY(member_ids)`,
    [memberId],
  );
}
