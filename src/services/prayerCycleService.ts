import { query } from '../config/db';
import { notifyRealtime } from '../realtime/notify';
import { addUtcDaysToIsoDate, getPrayerCyclePosition } from '../utils/isoDates';
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
  const rangeStart = addUtcDaysToIsoDate(start, cycleIndex * memberCount);
  const rangeEnd = addUtcDaysToIsoDate(start, (cycleIndex + 1) * memberCount - 1);

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
 * Подзапрос: нужда из `member_prayer_by_cycle` для `cycleIndexRef` (например `$2`).
 * Сначала точное совпадение cycle_index; иначе +1…+2 (сироты после смены формулы цикла).
 * Без COALESCE с `members.prayer_request` — иначе после смены цикла в поле «текущего» цикла
 * остаётся текст прошлого.
 */
export function buildCyclePrayerMpcPickSql(cycleIndexRef: string): {
  prayerRequest: string;
  updatedAt: string;
} {
  const where = `
    mpc_sel.member_id = m.id
    AND mpc_sel.cycle_index BETWEEN ${cycleIndexRef}::bigint AND ${cycleIndexRef}::bigint + 2
    AND NULLIF(TRIM(mpc_sel.prayer_request), '') IS NOT NULL`;
  const order = `
    ORDER BY
      CASE WHEN mpc_sel.cycle_index = ${cycleIndexRef}::bigint THEN 0 ELSE 1 END,
      CASE WHEN mpc_sel.cycle_index > ${cycleIndexRef}::bigint THEN 0 ELSE 1 END,
      ABS(mpc_sel.cycle_index - ${cycleIndexRef}::bigint),
      mpc_sel.updated_at DESC
    LIMIT 1`;
  return {
    prayerRequest: `(
      SELECT NULLIF(TRIM(mpc_sel.prayer_request), '')
      FROM member_prayer_by_cycle mpc_sel
      WHERE ${where}
      ${order}
    )`,
    updatedAt: `(
      SELECT mpc_sel.updated_at::text
      FROM member_prayer_by_cycle mpc_sel
      WHERE ${where}
      ${order}
    )`,
  };
}

/**
 * Прошлые даты календаря: нужда из журнала `member_prayer_request_history` для cycle_index дня,
 * с запасным чтением из mpc (если цикл ещё не заархивирован).
 */
export function buildCyclePrayerHistorySelectSql(cycleIndexRef: string): {
  prayerRequest: string;
  updatedAt: string;
} {
  const historyRequest = `(
    SELECT NULLIF(TRIM(h.prayer_request), '')
    FROM member_prayer_request_history h
    WHERE h.member_id = m.id
      AND h.cycle_index IS NOT DISTINCT FROM ${cycleIndexRef}::bigint
      AND NULLIF(TRIM(h.prayer_request), '') IS NOT NULL
    ORDER BY h.created_at DESC
    LIMIT 1
  )`;
  const mpcExactRequest = `(
    SELECT NULLIF(TRIM(mpc_sel.prayer_request), '')
    FROM member_prayer_by_cycle mpc_sel
    WHERE mpc_sel.member_id = m.id
      AND mpc_sel.cycle_index = ${cycleIndexRef}::bigint
      AND NULLIF(TRIM(mpc_sel.prayer_request), '') IS NOT NULL
    LIMIT 1
  )`;
  const historyUpdatedAt = `(
    SELECT h.created_at::text
    FROM member_prayer_request_history h
    WHERE h.member_id = m.id
      AND h.cycle_index IS NOT DISTINCT FROM ${cycleIndexRef}::bigint
      AND NULLIF(TRIM(h.prayer_request), '') IS NOT NULL
    ORDER BY h.created_at DESC
    LIMIT 1
  )`;
  const mpcExactUpdatedAt = `(
    SELECT mpc_sel.updated_at::text
    FROM member_prayer_by_cycle mpc_sel
    WHERE mpc_sel.member_id = m.id
      AND mpc_sel.cycle_index = ${cycleIndexRef}::bigint
      AND NULLIF(TRIM(mpc_sel.prayer_request), '') IS NOT NULL
    LIMIT 1
  )`;
  return {
    prayerRequest: `COALESCE(${historyRequest}, ${mpcExactRequest})`,
    updatedAt: `COALESCE(${historyUpdatedAt}, ${mpcExactUpdatedAt})`,
  };
}

/** @deprecated Use buildCyclePrayerMpcPickSql('$N') for the correct bind index. */
export const CYCLE_PRAYER_REQUEST_SELECT_SQL = buildCyclePrayerMpcPickSql('$1').prayerRequest;

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
 * После смены формулы cycle_index (выравнивание по понедельнику) нужды могли остаться
 * на cycle_index на 1–2 больше текущего — переносим в актуальный индекс, если там пусто.
 */
async function repairMisalignedPrayerCycleRows(ciNow: number): Promise<number> {
  const result = await query(
    `INSERT INTO member_prayer_by_cycle (member_id, cycle_index, prayer_request, updated_at)
     SELECT DISTINCT ON (src.member_id)
            src.member_id,
            $1::bigint,
            src.prayer_request,
            src.updated_at
       FROM member_prayer_by_cycle src
      WHERE src.cycle_index BETWEEN $1::bigint + 1 AND $1::bigint + 3
        AND NULLIF(trim(src.prayer_request), '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
            FROM member_prayer_by_cycle exact
           WHERE exact.member_id = src.member_id
             AND exact.cycle_index = $1::bigint
             AND NULLIF(trim(exact.prayer_request), '') IS NOT NULL
        )
      ORDER BY src.member_id, src.cycle_index ASC, src.updated_at DESC
     ON CONFLICT (member_id, cycle_index)
     DO UPDATE SET
       prayer_request = EXCLUDED.prayer_request,
       updated_at = EXCLUDED.updated_at
     WHERE NULLIF(trim(member_prayer_by_cycle.prayer_request), '') IS NULL`,
    [ciNow],
  );
  return result.rowCount ?? 0;
}

/**
 * Перенос нужд завершённых циклов в журнал; из member_prayer_by_cycle удаляем только уже
 * заархивированные строки (текст остаётся в member_prayer_request_history).
 */
export async function snapshotPastCyclePrayersToHistory(): Promise<number> {
  const todayYmd = getPrayerCycleTodayYmd();
  const snap = await getPrayerCycleSnapshotForDate(todayYmd);
  const ciNow = snap?.cycle_index ?? 0;

  await repairMisalignedPrayerCycleRows(ciNow);

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
  inserted += await archiveLegacyMemberPrayerRequestsToHistory(ciNow);

  const deletedPast = await query(
    `DELETE FROM member_prayer_by_cycle mpc
      WHERE mpc.cycle_index < $1
      ${MPC_DELETE_ONLY_IF_ARCHIVED_SQL}`,
    [ciNow],
  );
  if (inserted > 0 || (deletedPast.rowCount ?? 0) > 0) {
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

/** Вернуть очередь к алфавиту А–Я (удалить все сохранённые DnD-порядки). */
export async function clearAllPrayerCycleRosterCustomOrders(): Promise<{ deleted: number }> {
  const r = await query(`DELETE FROM prayer_cycle_roster_custom_order`);
  return { deleted: r.rowCount ?? 0 };
}
