import type { QueryResult, QueryResultRow } from 'pg';
import { query as rawQuery } from '../config/db';

function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return rawQuery(text, params) as Promise<QueryResult<T>>;
}

export const FAMILY_RELATIONS = [
  'spouse',
  'parent',
  'child',
  'sibling',
  'grandparent',
  'grandchild',
  'other',
] as const;
export type FamilyRelation = (typeof FAMILY_RELATIONS)[number];

export function isFamilyRelation(v: unknown): v is FamilyRelation {
  return typeof v === 'string' && (FAMILY_RELATIONS as readonly string[]).includes(v);
}

/** Как выглядит связь с другой стороны: родитель ↔ ребёнок, дедушка/бабушка ↔ внук/внучка. */
export function inverseRelation(r: FamilyRelation): FamilyRelation {
  switch (r) {
    case 'parent':
      return 'child';
    case 'child':
      return 'parent';
    case 'grandparent':
      return 'grandchild';
    case 'grandchild':
      return 'grandparent';
    default:
      return r;
  }
}

export interface FamilyLinkItem {
  id: number;
  /** Кем родственник приходится именно этому участнику. */
  relation: FamilyRelation;
  relative_member_id: number | null;
  relative_name: string;
  relative_avatar_url: string | null;
  relative_birth_date: string | null;
  note: string | null;
}

type Row = {
  id: string;
  member_id: number;
  relative_member_id: number | null;
  relative_name: string | null;
  relative_birth_date: string | null;
  relation: FamilyRelation;
  note: string | null;
  other_name: string | null;
  other_first: string | null;
  other_last: string | null;
  other_avatar: string | null;
  other_birth: string | null;
};

function displayName(row: Row): string {
  const last = (row.other_last ?? '').trim();
  const first = (row.other_first ?? '').trim();
  const joined = `${last} ${first}`.trim();
  return joined || (row.other_name ?? '').trim();
}

/** Связи участника: прямые (он — автор записи) и обратные (на него ссылаются из карточек других). */
export async function listFamilyLinks(memberId: number): Promise<FamilyLinkItem[]> {
  const { rows } = await query<Row>(
    `SELECT l.id::text AS id, l.member_id, l.relative_member_id, l.relative_name,
            l.relative_birth_date::text AS relative_birth_date, l.relation, l.note,
            o.name AS other_name, o.first_name AS other_first, o.last_name AS other_last,
            o.avatar_url AS other_avatar, o.birth_date::text AS other_birth
     FROM member_family_links l
     LEFT JOIN members o ON o.id = CASE WHEN l.member_id = $1 THEN l.relative_member_id ELSE l.member_id END
     WHERE l.member_id = $1 OR l.relative_member_id = $1
     ORDER BY l.created_at, l.id`,
    [memberId]
  );
  return rows.map((row) => {
    const direct = row.member_id === memberId;
    const linked = row.other_name !== null;
    return {
      id: Number(row.id),
      relation: direct ? row.relation : inverseRelation(row.relation),
      relative_member_id: direct ? row.relative_member_id : row.member_id,
      relative_name: linked ? displayName(row) : (row.relative_name ?? '').trim(),
      relative_avatar_url: linked ? row.other_avatar : null,
      relative_birth_date: linked ? row.other_birth : row.relative_birth_date,
      note: row.note,
    };
  });
}

export interface FamilyLinkInput {
  relation: FamilyRelation;
  relative_member_id?: number | null;
  relative_name?: string | null;
  relative_birth_date?: string | null;
  note?: string | null;
}

export async function createFamilyLink(memberId: number, input: FamilyLinkInput): Promise<void> {
  const relativeId = input.relative_member_id ?? null;
  const name = (input.relative_name ?? '').trim();
  if (relativeId === null && !name) {
    throw new Error('relative_required');
  }
  if (relativeId === memberId) {
    throw new Error('self_link');
  }
  if (relativeId !== null) {
    const exists = await query(`SELECT 1 FROM members WHERE id = $1`, [relativeId]);
    if (exists.rowCount === 0) {
      throw new Error('relative_not_found');
    }
    const dup = await query(
      `SELECT 1 FROM member_family_links
       WHERE (member_id = $1 AND relative_member_id = $2) OR (member_id = $2 AND relative_member_id = $1)`,
      [memberId, relativeId]
    );
    if (dup.rowCount) {
      throw new Error('already_linked');
    }
  }
  await query(
    `INSERT INTO member_family_links (member_id, relative_member_id, relative_name, relative_birth_date, relation, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      memberId,
      relativeId,
      relativeId === null ? name : null,
      relativeId === null ? input.relative_birth_date || null : null,
      input.relation,
      (input.note ?? '').trim() || null,
    ]
  );
}

/** Правка записи со стороны карточки memberId; для обратной связи отношение инвертируется. */
export async function updateFamilyLink(
  memberId: number,
  linkId: number,
  patch: Partial<FamilyLinkInput>
): Promise<boolean> {
  const cur = await query<{
    member_id: number;
    relative_member_id: number | null;
    relation: FamilyRelation;
  }>(
    `SELECT member_id, relative_member_id, relation FROM member_family_links
     WHERE id = $1 AND (member_id = $2 OR relative_member_id = $2)`,
    [linkId, memberId]
  );
  const row = cur.rows[0];
  if (!row) {
    return false;
  }
  const direct = row.member_id === memberId;
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.relation !== undefined) {
    vals.push(direct ? patch.relation : inverseRelation(patch.relation));
    sets.push(`relation = $${vals.length}`);
  }
  if (patch.note !== undefined) {
    vals.push((patch.note ?? '').trim() || null);
    sets.push(`note = $${vals.length}`);
  }
  if (row.relative_member_id === null) {
    if (patch.relative_name !== undefined) {
      const n = (patch.relative_name ?? '').trim();
      if (!n) {
        throw new Error('relative_required');
      }
      vals.push(n);
      sets.push(`relative_name = $${vals.length}`);
    }
    if (patch.relative_birth_date !== undefined) {
      vals.push(patch.relative_birth_date || null);
      sets.push(`relative_birth_date = $${vals.length}`);
    }
  }
  if (sets.length === 0) {
    return true;
  }
  vals.push(linkId);
  await query(`UPDATE member_family_links SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
  return true;
}

export async function deleteFamilyLink(memberId: number, linkId: number): Promise<boolean> {
  const r = await query(
    `DELETE FROM member_family_links WHERE id = $1 AND (member_id = $2 OR relative_member_id = $2)`,
    [linkId, memberId]
  );
  return (r.rowCount ?? 0) > 0;
}
