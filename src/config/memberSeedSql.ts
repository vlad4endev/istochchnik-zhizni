/**
 * Built-in church roster seed is retired.
 *
 * It used to re-insert deleted members on every rebuild/initDb.
 * Historical SQL (manual only): scripts/archive/church-roster-seed-2026-03.sql
 * Production path for people: backup restore or admin UI — never code.
 */

/** Always false: boot must never insert a roster from the repo. */
export function shouldSeedMembersOnInit(): boolean {
  return false;
}

/** No-op kept so older imports/scripts do not crash; inserts zero rows. */
export const MEMBER_SEED_SQL = `SELECT 0 WHERE FALSE`;
