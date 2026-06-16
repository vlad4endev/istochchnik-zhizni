import { query } from '../config/db';
import { listPlans, patchPlan } from './servicePlannerService';

export interface SundayScheduleMember {
  id: number;
  name: string;
  avatar_url: string | null;
  ministry_direction: string | null;
  ministry_role: string | null;
}

export interface SundaySchedulePlanRow {
  id: number;
  service_date: string;
  start_time: string;
  status: 'draft' | 'published';
  template_name: string | null;
  leader_member_id: number | null;
  preacher_member_id: number | null;
  blocks_count: number;
  leader: SundayScheduleMember | null;
  preacher: SundayScheduleMember | null;
}

function memberDisplayName(row: {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  const fn = String(row.first_name ?? '').trim();
  const ln = String(row.last_name ?? '').trim();
  const full = `${fn} ${ln}`.trim();
  if (full) return full;
  return String(row.name ?? '').trim() || 'Участник';
}

function mapMemberRow(row: Record<string, unknown> | undefined): SundayScheduleMember | null {
  if (!row || row.id == null) return null;
  return {
    id: Number(row.id),
    name: memberDisplayName(row),
    avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
    ministry_direction: row.ministry_direction == null ? null : String(row.ministry_direction),
    ministry_role: row.ministry_role == null ? null : String(row.ministry_role),
  };
}

async function enrichPlans(
  plans: Awaited<ReturnType<typeof listPlans>>,
): Promise<SundaySchedulePlanRow[]> {
  if (plans.length === 0) return [];

  const memberIds = new Set<number>();
  for (const p of plans) {
    if (p.leader_member_id) memberIds.add(p.leader_member_id);
    if (p.preacher_member_id) memberIds.add(p.preacher_member_id);
  }

  const membersById = new Map<number, SundayScheduleMember>();
  if (memberIds.size > 0) {
    const res = await query(
      `SELECT id, name, first_name, last_name, avatar_url, ministry_direction, ministry_role
       FROM members
       WHERE id = ANY($1::int[])`,
      [Array.from(memberIds)],
    );
    for (const row of res.rows as Record<string, unknown>[]) {
      const m = mapMemberRow(row);
      if (m) membersById.set(m.id, m);
    }
  }

  return plans.map((p) => ({
    id: p.id,
    service_date: p.service_date,
    start_time: p.start_time,
    status: p.status,
    template_name: p.template_name,
    leader_member_id: p.leader_member_id,
    preacher_member_id: p.preacher_member_id,
    blocks_count: p.blocks_count,
    leader: p.leader_member_id ? membersById.get(p.leader_member_id) ?? null : null,
    preacher: p.preacher_member_id ? membersById.get(p.preacher_member_id) ?? null : null,
  }));
}

export async function listSundaySchedulePlans(input: {
  from?: string;
  to?: string;
}): Promise<SundaySchedulePlanRow[]> {
  const plans = await listPlans({
    from: input.from,
    to: input.to,
    include_archived: false,
  });
  return enrichPlans(plans);
}

export async function listMySundaySchedulePlans(
  memberId: number,
  input: { from?: string; to?: string },
): Promise<SundaySchedulePlanRow[]> {
  const plans = await listPlans({
    from: input.from,
    to: input.to,
    include_archived: false,
  });
  const mine = plans.filter(
    (p) => p.leader_member_id === memberId || p.preacher_member_id === memberId,
  );
  return enrichPlans(mine);
}

export async function patchSundayScheduleAssignments(
  planId: number,
  patch: {
    leader_member_id?: number | null;
    preacher_member_id?: number | null;
  },
): Promise<boolean> {
  const payload: Parameters<typeof patchPlan>[1] = {};
  if (patch.leader_member_id !== undefined) payload.leader_member_id = patch.leader_member_id;
  if (patch.preacher_member_id !== undefined) payload.preacher_member_id = patch.preacher_member_id;
  if (Object.keys(payload).length === 0) return false;
  return patchPlan(planId, payload);
}

export async function listSundayScheduleMembers(): Promise<SundayScheduleMember[]> {
  const res = await query(
    `SELECT id, name, first_name, last_name, avatar_url, ministry_direction, ministry_role
     FROM members
     WHERE is_active = TRUE
     ORDER BY
       lower(coalesce(nullif(trim(last_name), ''), split_part(trim(name), ' ', 1))) asc,
       lower(coalesce(nullif(trim(first_name), ''), name)) asc,
       id asc`,
  );
  return (res.rows as Record<string, unknown>[])
    .map((row) => mapMemberRow(row))
    .filter((m): m is SundayScheduleMember => m != null);
}
