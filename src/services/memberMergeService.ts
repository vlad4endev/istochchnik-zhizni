import { pool, query } from '../config/db';
import { findMemberIdConflictingName } from './userService';

type MemberRow = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  name: string;
};

/** Варианты (имя, фамилия) для поиска конфликта — как у findMemberIdConflictingName. */
function mergeNameVariants(row: MemberRow): { fn: string; ln: string }[] {
  const f = (row.first_name ?? '').trim();
  const l = (row.last_name ?? '').trim();
  if (f && l) {
    return [{ fn: f, ln: l }];
  }
  const raw = (row.name ?? '').trim();
  if (!raw) {
    return [];
  }
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 3) {
    return [{ fn: parts.slice(1).join(' '), ln: parts[0] }];
  }
  if (parts.length === 2) {
    // «Имя Фамилия» и «Фамилия Имя» в одной строке — оба порядка
    return [
      { fn: parts[0], ln: parts[1] },
      { fn: parts[1], ln: parts[0] },
    ];
  }
  return [];
}

/**
 * Переносит данные и связи с dropId на keepId, затем удаляет dropId.
 * keepId должен быть меньше dropId (каноническая «старая» карточка).
 */
export async function mergeMemberInto(keepId: number, dropId: number): Promise<void> {
  if (keepId === dropId) {
    return;
  }
  if (keepId > dropId) {
    throw new Error('mergeMemberInto: keepId must be less than dropId');
  }

  const db = pool;
  if (!db) {
    throw new Error('Database pool unavailable');
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE members AS k
       SET
         password_hash = COALESCE(k.password_hash, d.password_hash),
         phone_number = COALESCE(
           NULLIF(TRIM(COALESCE(k.phone_number, '')), ''),
           NULLIF(TRIM(COALESCE(d.phone_number, '')), '')
         ),
         birth_date = COALESCE(k.birth_date, d.birth_date),
         email = COALESCE(k.email, d.email),
         ministry_role = COALESCE(
           NULLIF(TRIM(COALESCE(k.ministry_role, '')), ''),
           NULLIF(TRIM(COALESCE(d.ministry_role, '')), '')
         ),
         ministry_direction = COALESCE(
           NULLIF(TRIM(COALESCE(k.ministry_direction, '')), ''),
           NULLIF(TRIM(COALESCE(d.ministry_direction, '')), '')
         ),
         prayer_request = COALESCE(
           NULLIF(TRIM(COALESCE(k.prayer_request, '')), ''),
           NULLIF(TRIM(COALESCE(d.prayer_request, '')), '')
         ),
         first_name = COALESCE(
           NULLIF(TRIM(COALESCE(k.first_name, '')), ''),
           NULLIF(TRIM(COALESCE(d.first_name, '')), '')
         ),
         last_name = COALESCE(
           NULLIF(TRIM(COALESCE(k.last_name, '')), ''),
           NULLIF(TRIM(COALESCE(d.last_name, '')), '')
         ),
         name = CASE
           WHEN NULLIF(TRIM(COALESCE(k.first_name, '')), '') IS NOT NULL
             AND NULLIF(TRIM(COALESCE(k.last_name, '')), '') IS NOT NULL
           THEN TRIM(COALESCE(k.first_name, '') || ' ' || COALESCE(k.last_name, ''))
           WHEN NULLIF(TRIM(COALESCE(d.first_name, '')), '') IS NOT NULL
             AND NULLIF(TRIM(COALESCE(d.last_name, '')), '') IS NOT NULL
           THEN TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, ''))
           ELSE COALESCE(NULLIF(TRIM(k.name), ''), NULLIF(TRIM(d.name), ''), k.name)
         END,
         app_role = CASE
           WHEN k.app_role = 'admin' OR d.app_role = 'admin' THEN 'admin'
           WHEN k.app_role = 'editor' OR d.app_role = 'editor' THEN 'editor'
           WHEN k.app_role = 'musician' OR d.app_role = 'musician' THEN 'musician'
           ELSE 'member'
         END,
         is_collection_coordinator = k.is_collection_coordinator OR d.is_collection_coordinator,
         in_prayer_cycle = k.in_prayer_cycle OR d.in_prayer_cycle,
         is_active = k.is_active OR d.is_active,
         account_provider = COALESCE(k.account_provider, d.account_provider),
         account_id = COALESCE(k.account_id, d.account_id),
         updated_at = NOW()
       FROM members AS d
       WHERE d.id = $2 AND k.id = $1`,
      [keepId, dropId]
    );

    await client.query(`UPDATE auth_sessions SET member_id = $1 WHERE member_id = $2`, [
      keepId,
      dropId,
    ]);

    await client.query(
      `INSERT INTO member_prayer_by_cycle (member_id, cycle_index, prayer_request, updated_at)
       SELECT $1, cycle_index, prayer_request, updated_at
       FROM member_prayer_by_cycle WHERE member_id = $2
       ON CONFLICT (member_id, cycle_index) DO UPDATE SET
         prayer_request = COALESCE(
           NULLIF(EXCLUDED.prayer_request, ''),
           member_prayer_by_cycle.prayer_request
         ),
         updated_at = NOW()`,
      [keepId, dropId]
    );
    await client.query(`DELETE FROM member_prayer_by_cycle WHERE member_id = $1`, [dropId]);

    await client.query(`UPDATE member_prayer_request_history SET member_id = $1 WHERE member_id = $2`, [
      keepId,
      dropId,
    ]);

    await client.query(
      `DELETE FROM member_cycle_overrides d
       USING member_cycle_overrides k
       WHERE d.member_id = $2
         AND k.member_id = $1
         AND d.target_date = k.target_date`,
      [keepId, dropId]
    );
    await client.query(`UPDATE member_cycle_overrides SET member_id = $1 WHERE member_id = $2`, [
      keepId,
      dropId,
    ]);

    await client.query(
      `DELETE FROM cycle_collection_claims c
       USING cycle_collection_claims k
       WHERE c.member_id = $2
         AND k.member_id = $1
         AND c.cycle_index = k.cycle_index`,
      [keepId, dropId]
    );
    await client.query(
      `UPDATE cycle_collection_claims SET member_id = $1 WHERE member_id = $2`,
      [keepId, dropId]
    );

    await client.query(
      `DELETE FROM cycle_collection_claims c
       USING cycle_collection_claims k
       WHERE c.claimed_by_member_id = $2
         AND k.claimed_by_member_id = $1
         AND c.cycle_index = k.cycle_index
         AND c.member_id = k.member_id`,
      [keepId, dropId]
    );
    await client.query(
      `UPDATE cycle_collection_claims SET claimed_by_member_id = $1 WHERE claimed_by_member_id = $2`,
      [keepId, dropId]
    );

    await client.query(`UPDATE access_requests SET member_id = $1 WHERE member_id = $2`, [
      keepId,
      dropId,
    ]);

    await client.query(`UPDATE access_requests SET reviewed_by_member_id = $1 WHERE reviewed_by_member_id = $2`, [
      keepId,
      dropId,
    ]);

    await client.query(`DELETE FROM members WHERE id = $1`, [dropId]);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Объединяет дубликаты: одно и то же ФИО (логика как у findMemberIdConflictingName).
 * Оставляет карточку с меньшим id, переносит пароль и связи.
 */
export async function mergeAllDuplicateMembers(): Promise<{ mergedPairs: number }> {
  let mergedPairs = 0;
  let progress = true;

  while (progress) {
    progress = false;
    const result = await query(
      `SELECT id, first_name, last_name, name FROM members ORDER BY id ASC`
    );
    const list = result.rows as MemberRow[];

    outer: for (const m of list) {
      const variants = mergeNameVariants(m);
      for (const parsed of variants) {
        if (!parsed.fn || !parsed.ln) {
          continue;
        }
        const conflictId = await findMemberIdConflictingName(parsed.fn, parsed.ln, m.id);
        if (conflictId == null) {
          continue;
        }
        const keepId = Math.min(m.id, conflictId);
        const dropId = Math.max(m.id, conflictId);
        await mergeMemberInto(keepId, dropId);
        mergedPairs += 1;
        progress = true;
        break outer;
      }
    }
  }

  return { mergedPairs };
}

const BOOT_MERGE_PATCH_ID = 'members_merge_seed_duplicates_2026_04_19';

/** Один раз после обновления: сливает пары «сид + приложение» без повторного прохода на каждом старте. */
export async function mergeDuplicateMembersBootPatchIfNeeded(): Promise<void> {
  if (!pool) {
    return;
  }
  const r = await pool.query(`SELECT 1 FROM app_data_patches WHERE patch_id = $1`, [
    BOOT_MERGE_PATCH_ID,
  ]);
  if (r.rowCount) {
    return;
  }
  const { mergedPairs } = await mergeAllDuplicateMembers();
  await pool.query(`INSERT INTO app_data_patches (patch_id) VALUES ($1)`, [BOOT_MERGE_PATCH_ID]);
  if (mergedPairs > 0) {
    console.log(`[db] Объединено дубликатов участников (патч после сида): ${mergedPairs} пар.`);
  }
}
