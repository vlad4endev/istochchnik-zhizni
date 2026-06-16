import { query } from '../config/db';
import { listPlans, patchPlan } from './servicePlannerService';
import {
  ensureSundayScheduleSlotsSchema,
  listSundayScheduleSlots,
  upsertSundayScheduleSlot,
} from './sundayScheduleSlots';

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
  has_program: boolean;
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

type PlanDraft = {
  id: number;
  service_date: string;
  start_time: string;
  status: 'draft' | 'published';
  template_name: string | null;
  leader_member_id: number | null;
  preacher_member_id: number | null;
  blocks_count: number;
  has_program: boolean;
};

async function loadMembersByIds(memberIds: Set<number>): Promise<Map<number, SundayScheduleMember>> {
  const membersById = new Map<number, SundayScheduleMember>();
  if (memberIds.size === 0) return membersById;
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
  return membersById;
}

function attachMembers(plan: PlanDraft, membersById: Map<number, SundayScheduleMember>): SundaySchedulePlanRow {
  return {
    ...plan,
    leader: plan.leader_member_id ? membersById.get(plan.leader_member_id) ?? null : null,
    preacher: plan.preacher_member_id ? membersById.get(plan.preacher_member_id) ?? null : null,
  };
}

function collectMemberIds(plans: PlanDraft[]): Set<number> {
  const memberIds = new Set<number>();
  for (const p of plans) {
    if (p.leader_member_id) memberIds.add(p.leader_member_id);
    if (p.preacher_member_id) memberIds.add(p.preacher_member_id);
  }
  return memberIds;
}

function pickPrimaryPlanForDate(
  plans: Awaited<ReturnType<typeof listPlans>>,
): Awaited<ReturnType<typeof listPlans>>[number] | null {
  if (plans.length === 0) return null;
  return [...plans].sort((a, b) => {
    const blocksDiff = (b.blocks_count ?? 0) - (a.blocks_count ?? 0);
    if (blocksDiff !== 0) return blocksDiff;
    return b.id - a.id;
  })[0]!;
}

function planToDraft(plan: Awaited<ReturnType<typeof listPlans>>[number]): PlanDraft {
  return {
    id: plan.id,
    service_date: plan.service_date,
    start_time: plan.start_time,
    status: plan.status,
    template_name: plan.template_name,
    leader_member_id: plan.leader_member_id,
    preacher_member_id: plan.preacher_member_id,
    blocks_count: plan.blocks_count,
    has_program: true,
  };
}

function slotToDraft(slot: { service_date: string; leader_member_id: number | null; preacher_member_id: number | null }): PlanDraft {
  return {
    id: 0,
    service_date: slot.service_date,
    start_time: '10:00',
    status: 'draft',
    template_name: null,
    leader_member_id: slot.leader_member_id,
    preacher_member_id: slot.preacher_member_id,
    blocks_count: 0,
    has_program: false,
  };
}

function mergeSlotIntoDraft(draft: PlanDraft, slot: { leader_member_id: number | null; preacher_member_id: number | null }): PlanDraft {
  return {
    ...draft,
    leader_member_id: draft.leader_member_id ?? slot.leader_member_id,
    preacher_member_id: draft.preacher_member_id ?? slot.preacher_member_id,
  };
}

function hasAnyAssignment(plan: PlanDraft): boolean {
  return plan.leader_member_id != null || plan.preacher_member_id != null;
}

async function buildMergedPlanRows(input: {
  from?: string;
  to?: string;
  includeEmptySlots?: boolean;
}): Promise<SundaySchedulePlanRow[]> {
  await ensureSundayScheduleSlotsSchema();
  const plans = await listPlans({
    from: input.from,
    to: input.to,
    include_archived: false,
  });

  const plansByDate = new Map<string, Awaited<ReturnType<typeof listPlans>>>();
  for (const plan of plans) {
    const list = plansByDate.get(plan.service_date) ?? [];
    list.push(plan);
    plansByDate.set(plan.service_date, list);
  }

  const slots = await listSundayScheduleSlots({ from: input.from, to: input.to });
  const slotsByDate = new Map(slots.map((s) => [s.service_date, s]));

  const mergedDates = new Set<string>([...plansByDate.keys(), ...slotsByDate.keys()]);
  const drafts: PlanDraft[] = [];

  for (const date of mergedDates) {
    const primary = pickPrimaryPlanForDate(plansByDate.get(date) ?? []);
    const slot = slotsByDate.get(date);
    if (primary) {
      const draft = planToDraft(primary);
      drafts.push(slot ? mergeSlotIntoDraft(draft, slot) : draft);
      continue;
    }
    if (slot && (input.includeEmptySlots || hasAnyAssignment(slotToDraft(slot)))) {
      drafts.push(slotToDraft(slot));
    }
  }

  drafts.sort((a, b) => a.service_date.localeCompare(b.service_date) || a.id - b.id);
  const membersById = await loadMembersByIds(collectMemberIds(drafts));
  return drafts.map((draft) => attachMembers(draft, membersById));
}

export async function listSundaySchedulePlans(input: {
  from?: string;
  to?: string;
}): Promise<SundaySchedulePlanRow[]> {
  return buildMergedPlanRows({ from: input.from, to: input.to, includeEmptySlots: false });
}

export async function listMySundaySchedulePlans(
  memberId: number,
  input: { from?: string; to?: string },
): Promise<SundaySchedulePlanRow[]> {
  const rows = await buildMergedPlanRows({ from: input.from, to: input.to, includeEmptySlots: false });
  return rows.filter((p) => p.leader_member_id === memberId || p.preacher_member_id === memberId);
}

async function findPrimaryPlanIdForDate(serviceDate: string): Promise<number | null> {
  const res = await query(
    `select p.id
     from public.service_plans p
     left join lateral (
       select count(*)::int as blocks_count from public.service_blocks b where b.service_plan_id = p.id
     ) bc on true
     where p.service_date = $1::date and p.is_archived = false
     order by bc.blocks_count desc, p.id desc
     limit 1`,
    [serviceDate],
  );
  const row = res.rows[0] as { id?: number } | undefined;
  return row?.id != null ? Number(row.id) : null;
}

export async function patchSundayScheduleByDate(
  serviceDate: string,
  patch: {
    leader_member_id?: number | null;
    preacher_member_id?: number | null;
  },
): Promise<boolean> {
  if (patch.leader_member_id === undefined && patch.preacher_member_id === undefined) return false;

  await upsertSundayScheduleSlot(serviceDate, patch);

  const planId = await findPrimaryPlanIdForDate(serviceDate);
  if (planId) {
    const payload: Parameters<typeof patchPlan>[1] = {};
    if (patch.leader_member_id !== undefined) payload.leader_member_id = patch.leader_member_id;
    if (patch.preacher_member_id !== undefined) payload.preacher_member_id = patch.preacher_member_id;
    return patchPlan(planId, payload);
  }
  return true;
}

export async function patchSundayScheduleAssignments(
  planId: number,
  patch: {
    leader_member_id?: number | null;
    preacher_member_id?: number | null;
  },
): Promise<boolean> {
  if (patch.leader_member_id === undefined && patch.preacher_member_id === undefined) return false;

  const planRes = await query(
    `select service_date::text as service_date from public.service_plans where id = $1 limit 1`,
    [planId],
  );
  const serviceDate = (planRes.rows[0] as { service_date?: string } | undefined)?.service_date;
  if (!serviceDate) return false;

  await upsertSundayScheduleSlot(serviceDate, patch);

  const payload: Parameters<typeof patchPlan>[1] = {};
  if (patch.leader_member_id !== undefined) payload.leader_member_id = patch.leader_member_id;
  if (patch.preacher_member_id !== undefined) payload.preacher_member_id = patch.preacher_member_id;
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
