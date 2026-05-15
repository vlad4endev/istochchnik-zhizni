import { query } from '../config/db';
import { getCalendarWeekStartDate, type WeekPlanKind } from './calendarService';
import {
  getMergedPrayerCycleRosterMemberIdsForCycleIndex,
  getPrayerCycleSnapshotForDate,
  PRAYER_CYCLE_MEMBERS_WHERE_M,
} from './prayerCycleService';

const COORDINATOR_MEMBER_ORDER_SQL = `LOWER(COALESCE(NULLIF(trim(m.first_name), ''), split_part(trim(m.name), ' ', 1))) ASC,
  LOWER(COALESCE(NULLIF(trim(m.last_name), ''), NULLIF(trim(split_part(trim(m.name), ' ', 2)), ''), trim(m.name))) ASC,
  m.id ASC`;

let weekScopeReady = false;

/** Суррогатный PK(id): idempotent. Раньше вызывалась после if (weekScopeReady) — миграция никогда не выполнялась при «прогретом» флаге. */
const MIGRATE_CYCLE_COLLECTION_CLAIMS_PK_SQL = `DO $cycle_claims_pk$
DECLARE
  pk_len int;
BEGIN
  SELECT array_length(c.conkey, 1) INTO pk_len
  FROM pg_constraint c
  WHERE c.conrelid = 'public.cycle_collection_claims'::regclass AND c.contype = 'p'
  LIMIT 1;

  IF COALESCE(pk_len, 0) = 2 THEN
    ALTER TABLE public.cycle_collection_claims ADD COLUMN IF NOT EXISTS id BIGINT;
    CREATE SEQUENCE IF NOT EXISTS cycle_collection_claims_id_seq;
    PERFORM setval(
      'cycle_collection_claims_id_seq',
      GREATEST(COALESCE((SELECT MAX(id) FROM public.cycle_collection_claims), 0), 1),
      true
    );
    UPDATE public.cycle_collection_claims SET id = nextval('cycle_collection_claims_id_seq') WHERE id IS NULL;
    ALTER TABLE public.cycle_collection_claims ALTER COLUMN id SET DEFAULT nextval('cycle_collection_claims_id_seq');
    ALTER TABLE public.cycle_collection_claims ALTER COLUMN id SET NOT NULL;
    ALTER TABLE public.cycle_collection_claims DROP CONSTRAINT cycle_collection_claims_pkey;
    ALTER TABLE public.cycle_collection_claims ADD CONSTRAINT cycle_collection_claims_pkey PRIMARY KEY (id);
  END IF;
END
$cycle_claims_pk$`;

export async function migrateCycleCollectionClaimsSurrogatePkIfNeeded(): Promise<void> {
  await query(MIGRATE_CYCLE_COLLECTION_CLAIMS_PK_SQL);
}

export async function ensureCycleCollectionClaimsWeekScopeSchema(): Promise<void> {
  await migrateCycleCollectionClaimsSurrogatePkIfNeeded();

  if (weekScopeReady) return;
  await query(`ALTER TABLE cycle_collection_claims ADD COLUMN IF NOT EXISTS week_start_date DATE`);
  await query(`DROP INDEX IF EXISTS cycle_collection_claims_week_member_uidx`);
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS cycle_collection_claims_week_member_uidx
     ON cycle_collection_claims (week_start_date, member_id)
     WHERE week_start_date IS NOT NULL`,
  );
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS cycle_collection_claims_cycle_member_legacy_uidx
     ON cycle_collection_claims (cycle_index, member_id)
     WHERE week_start_date IS NULL`,
  );
  await query(
    `CREATE INDEX IF NOT EXISTS cycle_collection_claims_week_start_idx
     ON cycle_collection_claims (week_start_date)`,
  );
  weekScopeReady = true;
}

export interface CycleCollectionClaimRow {
  id: number;
  name: string;
  first_name: string | null;
  last_name: string | null;
  claimed_by: {
    id: number;
    name: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
  /** Можно поставить/снять галочку (не занято другим или занято мной). */
  can_toggle: boolean;
}

export interface CycleCollectionClaimsSnapshot {
  cycle_index: number;
  cycle_number: number;
  coordinators: Array<{
    id: number;
    name: string;
    first_name: string | null;
    last_name: string | null;
  }>;
  members: CycleCollectionClaimRow[];
}

export async function getCycleCollectionClaimsSnapshot(
  authUserId: number | null,
  authIsAdmin: boolean,
  authIsPastor: boolean,
  /** Какую неделю смотрим: цикл и отметки сбора считаются от понедельника этой недели (как план недели). Без параметра — по-прежнему от сегодняшней даты. */
  weekKind?: WeekPlanKind
): Promise<CycleCollectionClaimsSnapshot> {
  await ensureCycleCollectionClaimsWeekScopeSchema();
  const refDate =
    weekKind === undefined ? new Date().toISOString().slice(0, 10) : getCalendarWeekStartDate(weekKind);
  const snap = await getPrayerCycleSnapshotForDate(refDate);
  if (!snap) {
    return { cycle_index: 0, cycle_number: 1, coordinators: [], members: [] };
  }
  const coordinatorsResult = await query(
    `SELECT m.id, m.name, m.first_name, m.last_name
     FROM members m
     WHERE m.is_active = TRUE
       AND m.is_collection_coordinator = TRUE
     ORDER BY ${COORDINATOR_MEMBER_ORDER_SQL}`,
    [],
  );


  const cycleIndex = snap.cycle_index;

  const mergedIds = await getMergedPrayerCycleRosterMemberIdsForCycleIndex(cycleIndex);
  const membersResult =
    mergedIds.length === 0
      ? { rows: [] as { id: number; name: string; first_name: string | null; last_name: string | null }[] }
      : await query(
          `SELECT m.id, m.name, m.first_name, m.last_name
           FROM members m
           WHERE m.id = ANY($1::int[])
           ORDER BY array_position($1::int[], m.id)`,
          [mergedIds],
        );

  const claimsResult =
    weekKind === undefined
      ? await query(
          `SELECT c.member_id, c.claimed_by_member_id,
                  cb.name AS claimer_name, cb.first_name AS claimer_first_name, cb.last_name AS claimer_last_name
           FROM cycle_collection_claims c
           JOIN members cb ON cb.id = c.claimed_by_member_id
           WHERE c.cycle_index = $1
             AND c.week_start_date IS NULL`,
          [cycleIndex],
        )
      : await query(
          `SELECT c.member_id, c.claimed_by_member_id,
                  cb.name AS claimer_name, cb.first_name AS claimer_first_name, cb.last_name AS claimer_last_name
           FROM cycle_collection_claims c
           JOIN members cb ON cb.id = c.claimed_by_member_id
           WHERE c.week_start_date = $1::date`,
          [refDate],
        );

  const claimByMember = new Map<
    number,
    { id: number; name: string; first_name: string | null; last_name: string | null }
  >();
  for (const row of claimsResult.rows as {
    member_id: number;
    claimed_by_member_id: number;
    claimer_name: string;
    claimer_first_name: string | null;
    claimer_last_name: string | null;
  }[]) {
    claimByMember.set(row.member_id, {
      id: row.claimed_by_member_id,
      name: String(row.claimer_name ?? ''),
      first_name: row.claimer_first_name,
      last_name: row.claimer_last_name,
    });
  }

  let canManage = false;
  if (authUserId != null) {
    if (authIsAdmin) {
      canManage = true;
    } else if (authIsPastor) {
      canManage = true;
    } else {
      const coord = await query(
        `SELECT 1 FROM members WHERE id = $1 AND is_active = TRUE AND is_collection_coordinator = TRUE LIMIT 1`,
        [authUserId]
      );
      canManage = (coord.rowCount ?? 0) > 0;
    }
  }

  const members: CycleCollectionClaimRow[] = (
    membersResult.rows as {
      id: number;
      name: string;
      first_name: string | null;
      last_name: string | null;
    }[]
  ).map((m) => {
    const claimed = claimByMember.get(m.id) ?? null;
    const can_toggle =
      canManage && (authIsAdmin || authIsPastor || claimed == null || claimed.id === authUserId);
    return {
      id: m.id,
      name: m.name,
      first_name: m.first_name,
      last_name: m.last_name,
      claimed_by: claimed,
      can_toggle,
    };
  });

  return {
    cycle_index: cycleIndex,
    cycle_number: snap.cycle_number,
    coordinators: (coordinatorsResult.rows as {
      id: number;
      name: string;
      first_name: string | null;
      last_name: string | null;
    }[]).map((c) => ({
      id: c.id,
      name: c.name,
      first_name: c.first_name,
      last_name: c.last_name,
    })),
    members,
  };
}

/**
 * Заявить участника для сбора нужд в текущем цикле или снять свою заявку.
 * @throws Error: not_allowed | already_claimed | not_owner | invalid_member
 */
export async function setCycleCollectionClaim(params: {
  authUserId: number;
  authIsAdmin: boolean;
  authIsPastor: boolean;
  memberId: number;
  claim: boolean;
  /** Для админа/пастора: назначить конкретного куратора. */
  assignedCoordinatorId?: number;
  /** Тот же week, что при GET snapshot — иначе отметка попадёт в цикл «сегодня». */
  weekKind?: WeekPlanKind;
}): Promise<void> {
  await ensureCycleCollectionClaimsWeekScopeSchema();
  const { authUserId, authIsAdmin, authIsPastor, memberId, claim, assignedCoordinatorId, weekKind } = params;

  let canManage = false;
  if (authIsAdmin) {
    canManage = true;
  } else if (authIsPastor) {
    canManage = true;
  } else {
    const coord = await query(
      `SELECT 1 FROM members WHERE id = $1 AND is_active = TRUE AND is_collection_coordinator = TRUE LIMIT 1`,
      [authUserId]
    );
    canManage = (coord.rowCount ?? 0) > 0;
  }
  if (!canManage) {
    throw new Error('not_allowed');
  }
  const targetCoordinatorId =
    typeof assignedCoordinatorId === 'number' && Number.isInteger(assignedCoordinatorId) && assignedCoordinatorId > 0
      ? assignedCoordinatorId
      : null;
  const canAssignArbitraryCoordinator = authIsAdmin || authIsPastor;
  if (targetCoordinatorId != null && !canAssignArbitraryCoordinator && targetCoordinatorId !== authUserId) {
    throw new Error('not_allowed');
  }
  if (targetCoordinatorId != null) {
    const coordCheck = await query(
      `SELECT 1
       FROM members
       WHERE id = $1
         AND is_active = TRUE
         AND is_collection_coordinator = TRUE
       LIMIT 1`,
      [targetCoordinatorId],
    );
    if ((coordCheck.rowCount ?? 0) === 0) {
      throw new Error('invalid_coordinator');
    }
  }

  const refDate =
    weekKind === undefined ? new Date().toISOString().slice(0, 10) : getCalendarWeekStartDate(weekKind);
  const snap = await getPrayerCycleSnapshotForDate(refDate);
  if (!snap) {
    throw new Error('invalid_member');
  }
  const cycleIndex = snap.cycle_index;
  const weekStartDate = weekKind ? getCalendarWeekStartDate(weekKind) : null;

  const memCheck = await query(
    `SELECT 1 FROM members m WHERE m.id = $1 AND ${PRAYER_CYCLE_MEMBERS_WHERE_M} LIMIT 1`,
    [memberId],
  );
  if ((memCheck.rowCount ?? 0) === 0) {
    throw new Error('invalid_member');
  }

  if (claim) {
    const ownerId = targetCoordinatorId ?? authUserId;
    if (canAssignArbitraryCoordinator && targetCoordinatorId != null) {
      if (weekStartDate == null) {
        await query(
          `INSERT INTO cycle_collection_claims (cycle_index, member_id, claimed_by_member_id, week_start_date)
           VALUES ($1, $2, $3, NULL)
           ON CONFLICT (cycle_index, member_id) WHERE week_start_date IS NULL
           DO UPDATE SET
             claimed_by_member_id = EXCLUDED.claimed_by_member_id,
             cycle_index = EXCLUDED.cycle_index`,
          [cycleIndex, memberId, ownerId],
        );
      } else {
        await query(
          `INSERT INTO cycle_collection_claims (cycle_index, member_id, claimed_by_member_id, week_start_date)
           VALUES ($1, $2, $3, $4::date)
           ON CONFLICT (week_start_date, member_id) WHERE week_start_date IS NOT NULL
           DO UPDATE SET
             claimed_by_member_id = EXCLUDED.claimed_by_member_id,
             cycle_index = EXCLUDED.cycle_index`,
          [cycleIndex, memberId, ownerId, weekStartDate],
        );
      }
      return;
    }
    const existing =
      weekStartDate == null
        ? await query(
            `SELECT claimed_by_member_id
             FROM cycle_collection_claims
             WHERE cycle_index = $1 AND member_id = $2 AND week_start_date IS NULL`,
            [cycleIndex, memberId],
          )
        : await query(
            `SELECT claimed_by_member_id
             FROM cycle_collection_claims
             WHERE week_start_date = $1::date AND member_id = $2`,
            [weekStartDate, memberId],
          );
    const row = existing.rows[0] as { claimed_by_member_id?: number } | undefined;
    if (row) {
      if (row.claimed_by_member_id === authUserId) {
        return;
      }
      throw new Error('already_claimed');
    }

    try {
      if (weekStartDate == null) {
        await query(
          `INSERT INTO cycle_collection_claims (cycle_index, member_id, claimed_by_member_id, week_start_date)
           VALUES ($1, $2, $3, NULL)`,
          [cycleIndex, memberId, ownerId],
        );
      } else {
        await query(
          `INSERT INTO cycle_collection_claims (cycle_index, member_id, claimed_by_member_id, week_start_date)
           VALUES ($1, $2, $3, $4::date)`,
          [cycleIndex, memberId, ownerId, weekStartDate],
        );
      }
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === '23505') {
        const again =
          weekStartDate == null
            ? await query(
                `SELECT claimed_by_member_id
                 FROM cycle_collection_claims
                 WHERE cycle_index = $1 AND member_id = $2 AND week_start_date IS NULL`,
                [cycleIndex, memberId],
              )
            : await query(
                `SELECT claimed_by_member_id
                 FROM cycle_collection_claims
                 WHERE week_start_date = $1::date AND member_id = $2`,
                [weekStartDate, memberId],
              );
        const owner = again.rows[0] as { claimed_by_member_id?: number } | undefined;
        if (owner?.claimed_by_member_id === authUserId) return;
        throw new Error('already_claimed');
      }
      throw err;
    }
  } else {
    if (canAssignArbitraryCoordinator) {
      const del =
        weekStartDate == null
          ? await query(
              `DELETE FROM cycle_collection_claims
               WHERE cycle_index = $1 AND member_id = $2 AND week_start_date IS NULL`,
              [cycleIndex, memberId],
            )
          : await query(
              `DELETE FROM cycle_collection_claims
               WHERE week_start_date = $1::date AND member_id = $2`,
              [weekStartDate, memberId],
            );
      if ((del.rowCount ?? 0) === 0) {
        throw new Error('not_owner');
      }
    } else {
      const del =
        weekStartDate == null
          ? await query(
              `DELETE FROM cycle_collection_claims
               WHERE cycle_index = $1 AND member_id = $2 AND claimed_by_member_id = $3
                 AND week_start_date IS NULL`,
              [cycleIndex, memberId, authUserId],
            )
          : await query(
              `DELETE FROM cycle_collection_claims
               WHERE week_start_date = $1::date AND member_id = $2 AND claimed_by_member_id = $3`,
              [weekStartDate, memberId, authUserId],
            );
      if ((del.rowCount ?? 0) === 0) {
        throw new Error('not_owner');
      }
    }
  }
}
