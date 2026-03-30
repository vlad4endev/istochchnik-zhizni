import { query } from '../config/db';
import { getPrayerCycleSnapshotForDate } from './prayerCycleService';

const MEMBER_ORDER_SQL = `LOWER(COALESCE(NULLIF(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1))) ASC,
  LOWER(COALESCE(NULLIF(trim(m.first_name), ''), m.name)) ASC,
  m.id ASC`;

export interface CycleCollectionClaimRow {
  id: number;
  name: string;
  claimed_by: { id: number; name: string } | null;
  /** Можно поставить/снять галочку (не занято другим или занято мной). */
  can_toggle: boolean;
}

export interface CycleCollectionClaimsSnapshot {
  cycle_index: number;
  cycle_number: number;
  members: CycleCollectionClaimRow[];
}

export async function getCycleCollectionClaimsSnapshot(
  authUserId: number | null,
  authIsAdmin: boolean
): Promise<CycleCollectionClaimsSnapshot> {
  const today = new Date().toISOString().slice(0, 10);
  const snap = await getPrayerCycleSnapshotForDate(today);
  if (!snap) {
    return { cycle_index: 0, cycle_number: 1, members: [] };
  }

  const cycleIndex = snap.cycle_index;

  const membersResult = await query(
    `SELECT m.id, m.name FROM members m
     WHERE m.is_active = TRUE
     ORDER BY ${MEMBER_ORDER_SQL}`,
    []
  );

  const claimsResult = await query(
    `SELECT c.member_id, c.claimed_by_member_id, cb.name AS claimer_name
     FROM cycle_collection_claims c
     JOIN members cb ON cb.id = c.claimed_by_member_id
     WHERE c.cycle_index = $1`,
    [cycleIndex]
  );

  const claimByMember = new Map<number, { id: number; name: string }>();
  for (const row of claimsResult.rows as {
    member_id: number;
    claimed_by_member_id: number;
    claimer_name: string;
  }[]) {
    claimByMember.set(row.member_id, {
      id: row.claimed_by_member_id,
      name: String(row.claimer_name ?? ''),
    });
  }

  let canManage = false;
  if (authUserId != null) {
    if (authIsAdmin) {
      canManage = true;
    } else {
      const coord = await query(
        `SELECT 1 FROM members WHERE id = $1 AND is_active = TRUE AND is_collection_coordinator = TRUE LIMIT 1`,
        [authUserId]
      );
      canManage = (coord.rowCount ?? 0) > 0;
    }
  }

  const members: CycleCollectionClaimRow[] = (membersResult.rows as { id: number; name: string }[]).map(
    (m) => {
      const claimed = claimByMember.get(m.id) ?? null;
      const can_toggle =
        canManage && (claimed == null || claimed.id === authUserId);
      return {
        id: m.id,
        name: m.name,
        claimed_by: claimed,
        can_toggle,
      };
    }
  );

  return {
    cycle_index: cycleIndex,
    cycle_number: snap.cycle_number,
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
  memberId: number;
  claim: boolean;
}): Promise<void> {
  const { authUserId, authIsAdmin, memberId, claim } = params;

  let canManage = false;
  if (authIsAdmin) {
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

  const today = new Date().toISOString().slice(0, 10);
  const snap = await getPrayerCycleSnapshotForDate(today);
  if (!snap) {
    throw new Error('invalid_member');
  }
  const cycleIndex = snap.cycle_index;

  const memCheck = await query(`SELECT 1 FROM members WHERE id = $1 AND is_active = TRUE LIMIT 1`, [
    memberId,
  ]);
  if ((memCheck.rowCount ?? 0) === 0) {
    throw new Error('invalid_member');
  }

  if (claim) {
    const existing = await query(
      `SELECT claimed_by_member_id FROM cycle_collection_claims WHERE cycle_index = $1 AND member_id = $2`,
      [cycleIndex, memberId]
    );
    const row = existing.rows[0] as { claimed_by_member_id?: number } | undefined;
    if (row) {
      if (row.claimed_by_member_id === authUserId) {
        return;
      }
      throw new Error('already_claimed');
    }

    try {
      await query(
        `INSERT INTO cycle_collection_claims (cycle_index, member_id, claimed_by_member_id)
         VALUES ($1, $2, $3)`,
        [cycleIndex, memberId, authUserId]
      );
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === '23505') {
        const again = await query(
          `SELECT claimed_by_member_id FROM cycle_collection_claims WHERE cycle_index = $1 AND member_id = $2`,
          [cycleIndex, memberId]
        );
        const owner = again.rows[0] as { claimed_by_member_id?: number } | undefined;
        if (owner?.claimed_by_member_id === authUserId) return;
        throw new Error('already_claimed');
      }
      throw err;
    }
  } else {
    const del = await query(
      `DELETE FROM cycle_collection_claims
       WHERE cycle_index = $1 AND member_id = $2 AND claimed_by_member_id = $3`,
      [cycleIndex, memberId, authUserId]
    );
    if ((del.rowCount ?? 0) === 0) {
      throw new Error('not_owner');
    }
  }
}
