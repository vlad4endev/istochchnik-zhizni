import { query } from '../config/db';
import { memberHasMinistryRole, musicRoleMemberMatchTokens } from '../utils/ministryRoleMatch';
import { sendPush } from './pushService';

export type AssignmentStatus = 'assigned' | 'confirmed' | 'declined' | 'pending';

export interface MusicRole {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  ministry_direction_filter: string | null;
  ministry_role_filter: string | null;
  created_at?: string;
}

/** Событие расписания медиа = план служения (service_plans.id в поле id / event_ref_id). */
export interface MusicEvent {
  id: number;
  event_ref_id: number;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  event_type: string;
  notes: string | null;
  template_name: string | null;
  church_event_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface MusicAssignmentMember {
  id: number;
  name: string;
  avatar_url: string | null;
}

export interface MusicAssignment {
  id: number;
  event_ref_id: number;
  member_id: number;
  role_id: number;
  status: AssignmentStatus;
  notes: string | null;
  member: MusicAssignmentMember;
  role: MusicRole;
}

export interface EventWithAssignments extends MusicEvent {
  assignments: MusicAssignment[];
}

export interface MusicScheduleMember {
  id: number;
  name: string;
  avatar_url: string | null;
  ministry_direction: string | null;
  ministry_role: string | null;
  phone: string | null;
  email: string | null;
}

export interface CreateRoleInput {
  name: string;
  color?: string;
  icon?: string | null;
  sort_order?: number;
  is_active?: boolean;
  ministry_direction_filter?: string | null;
  ministry_role_filter?: string | null;
}

export type UpdateRoleInput = Partial<CreateRoleInput>;

const ASSIGNMENT_STATUSES = new Set<AssignmentStatus>([
  'assigned',
  'confirmed',
  'declined',
  'pending',
]);

const MUSIC_MEMBER_DIRECTION_PATTERNS = [
  '%музык%',
  '%music%',
  '%поклонен%',
  '%вокал%',
  '%гитар%',
  '%барабан%',
  '%клавиш%',
  '%звук%',
];

const PLAN_SELECT = `
  SELECT
    p.id,
    p.id AS event_ref_id,
    COALESCE(NULLIF(TRIM(ce.title), ''), NULLIF(TRIM(t.name), ''), 'Служение') AS title,
    p.service_date::text AS event_date,
    p.start_time,
    NULL::time AS end_time,
    'service' AS event_type,
    p.notes,
    t.name AS template_name,
    p.church_event_id,
    p.created_at,
    p.updated_at
  FROM service_plans p
  LEFT JOIN service_templates t ON t.id = p.template_id
  LEFT JOIN church_events ce ON ce.id = p.church_event_id
`;

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

function parseDateYmd(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function formatTimeHm(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = /^(\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  return `${m[1]}:${m[2]}`;
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

function mapRoleRow(row: Record<string, unknown>): MusicRole {
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    color: String(row.color ?? '#6366f1'),
    icon: row.icon == null ? null : String(row.icon),
    sort_order: Number(row.sort_order ?? 0),
    is_active: row.is_active !== false,
    ministry_direction_filter:
      row.ministry_direction_filter == null ? null : String(row.ministry_direction_filter),
    ministry_role_filter:
      row.ministry_role_filter == null ? null : String(row.ministry_role_filter),
    created_at: row.created_at == null ? undefined : String(row.created_at),
  };
}

function mapEventRow(row: Record<string, unknown>): MusicEvent {
  const planId = Number(row.event_ref_id ?? row.id);
  return {
    id: planId,
    event_ref_id: planId,
    title: String(row.title ?? 'Служение'),
    event_date: String(row.event_date ?? '').slice(0, 10),
    start_time: formatTimeHm(row.start_time),
    end_time: formatTimeHm(row.end_time),
    event_type: String(row.event_type ?? 'service'),
    notes: row.notes == null ? null : String(row.notes),
    template_name: row.template_name == null ? null : String(row.template_name),
    church_event_id: row.church_event_id == null ? null : Number(row.church_event_id),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

async function fetchPlanContext(planId: number): Promise<{
  title: string;
  event_date: string;
  start_time: string | null;
} | null> {
  const result = await query(
    `${PLAN_SELECT} WHERE p.id = $1 AND p.is_archived = FALSE LIMIT 1`,
    [planId],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const ev = mapEventRow(row);
  return { title: ev.title, event_date: ev.event_date, start_time: ev.start_time };
}

async function notifyAssignment(
  memberId: number,
  kind: 'assignment' | 'cancellation' | 'reminder' | 'declined_to_manager',
  ctx: {
    roleName: string;
    eventTitle: string;
    eventDate: string;
    startTime: string | null;
    memberName?: string;
  },
  extra?: { assignmentId?: number; eventRefId?: number; roleId?: number },
): Promise<void> {
  const timePart = ctx.startTime ? ` · ${ctx.startTime}` : '';
  const datePart = `${ctx.eventTitle} · ${ctx.eventDate}${timePart}`;
  const body =
    kind === 'declined_to_manager' && ctx.memberName
      ? `${ctx.memberName} отказался(а) · ${ctx.roleName} · ${datePart}`
      : `${ctx.roleName} · ${datePart}`;

  if (kind === 'assignment') {
    await sendPush(memberId, '📅 Вас назначили на служение', body, {
      url: '/music-schedule/my',
      type: 'music_assignment',
      assignmentId: extra?.assignmentId != null ? String(extra.assignmentId) : '',
      eventRefId: extra?.eventRefId != null ? String(extra.eventRefId) : '',
      roleId: extra?.roleId != null ? String(extra.roleId) : '',
      actions: JSON.stringify([
        { action: 'confirm', title: '✓ Подтвердить' },
        { action: 'decline', title: '✗ Отказать' },
      ]),
    });
    return;
  }

  if (kind === 'cancellation') {
    await sendPush(memberId, 'Назначение отменено', body, {
      type: 'music_cancellation',
    });
    return;
  }

  if (kind === 'declined_to_manager') {
    const planId = extra?.eventRefId;
    await sendPush(memberId, '⚠️ Отказ от назначения', body, {
      url: planId != null ? `/music-schedule?planId=${planId}` : '/music-schedule',
      type: 'music_assignment_declined',
      assignmentId: extra?.assignmentId != null ? String(extra.assignmentId) : '',
      eventRefId: planId != null ? String(planId) : '',
      roleId: extra?.roleId != null ? String(extra.roleId) : '',
    });
    return;
  }

  await sendPush(memberId, '⏰ Напоминание о служении завтра', body, {
    url: '/music-schedule/my',
    type: 'music_reminder',
  });
}

async function fetchAssignmentsForPlanIds(planIds: number[]): Promise<Map<number, MusicAssignment[]>> {
  const out = new Map<number, MusicAssignment[]>();
  if (planIds.length === 0) return out;

  const result = await query(
    `SELECT
       a.id,
       a.event_ref_id,
       a.member_id,
       a.role_id,
       a.status,
       a.notes,
       m.name,
       m.first_name,
       m.last_name,
       m.avatar_url,
       r.name AS role_name,
       r.color AS role_color,
       r.icon AS role_icon,
       r.sort_order AS role_sort_order,
       r.is_active AS role_is_active,
       r.ministry_direction_filter AS role_ministry_direction_filter,
       r.ministry_role_filter AS role_ministry_role_filter
     FROM music_assignments a
     JOIN members m ON m.id = a.member_id
     JOIN music_roles r ON r.id = a.role_id
     WHERE a.event_ref_id = ANY($1::bigint[])
     ORDER BY r.sort_order ASC, r.id ASC, m.name ASC`,
    [planIds],
  );

  for (const raw of result.rows as Record<string, unknown>[]) {
    const planId = Number(raw.event_ref_id);
    const role: MusicRole = {
      id: Number(raw.role_id),
      name: String(raw.role_name ?? ''),
      color: String(raw.role_color ?? '#6366f1'),
      icon: raw.role_icon == null ? null : String(raw.role_icon),
      sort_order: Number(raw.role_sort_order ?? 0),
      is_active: raw.role_is_active !== false,
      ministry_direction_filter:
        raw.role_ministry_direction_filter == null
          ? null
          : String(raw.role_ministry_direction_filter),
      ministry_role_filter:
        raw.role_ministry_role_filter == null ? null : String(raw.role_ministry_role_filter),
    };
    const assignment: MusicAssignment = {
      id: Number(raw.id),
      event_ref_id: planId,
      member_id: Number(raw.member_id),
      role_id: Number(raw.role_id),
      status: String(raw.status ?? 'assigned') as AssignmentStatus,
      notes: raw.notes == null ? null : String(raw.notes),
      member: {
        id: Number(raw.member_id),
        name: memberDisplayName(raw),
        avatar_url: raw.avatar_url == null ? null : String(raw.avatar_url),
      },
      role,
    };
    const list = out.get(planId) ?? [];
    list.push(assignment);
    out.set(planId, list);
  }

  return out;
}

async function attachAssignments(events: MusicEvent[]): Promise<EventWithAssignments[]> {
  const ids = events.map((e) => e.event_ref_id);
  const byPlan = await fetchAssignmentsForPlanIds(ids);
  return events.map((event) => ({
    ...event,
    assignments: byPlan.get(event.event_ref_id) ?? [],
  }));
}

function dateToYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function getEventsWithAssignments(from: Date, to: Date): Promise<EventWithAssignments[]> {
  const fromYmd = parseDateYmd(dateToYmdLocal(from)) ?? dateToYmdLocal(from);
  const toYmd = parseDateYmd(dateToYmdLocal(to)) ?? dateToYmdLocal(to);

  const result = await query(
    `${PLAN_SELECT}
     WHERE p.service_date >= $1::date
       AND p.service_date <= $2::date
       AND p.is_archived = FALSE
     ORDER BY p.service_date ASC, p.start_time ASC NULLS LAST, p.id ASC`,
    [fromYmd, toYmd],
  );

  const events = (result.rows as Record<string, unknown>[]).map(mapEventRow);
  return attachAssignments(events);
}

export async function getEventByPlanId(planId: number): Promise<EventWithAssignments | null> {
  const result = await query(
    `${PLAN_SELECT} WHERE p.id = $1 AND p.is_archived = FALSE LIMIT 1`,
    [planId],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const [withAssignments] = await attachAssignments([mapEventRow(row)]);
  return withAssignments ?? null;
}

export async function getAssignmentsForPlan(planId: number): Promise<MusicAssignment[]> {
  const map = await fetchAssignmentsForPlanIds([planId]);
  return map.get(planId) ?? [];
}

export async function resolvePlanIdForChurchEvent(
  churchEventId: number,
  occurrenceDate: string,
): Promise<number | null> {
  const ymd = parseDateYmd(occurrenceDate);
  if (!ymd) return null;

  const byLink = await query(
    `SELECT id FROM service_plans
     WHERE church_event_id = $1 AND service_date = $2::date AND is_archived = FALSE
     ORDER BY id DESC LIMIT 1`,
    [churchEventId, ymd],
  );
  const linked = (byLink.rows[0] as { id?: number } | undefined)?.id;
  if (linked != null) return Number(linked);

  const byDate = await query(
    `SELECT id FROM service_plans
     WHERE service_date = $1::date AND is_archived = FALSE
     ORDER BY id DESC LIMIT 1`,
    [ymd],
  );
  const fallback = (byDate.rows[0] as { id?: number } | undefined)?.id;
  return fallback != null ? Number(fallback) : null;
}

export async function assignMember(
  eventRefId: number,
  memberId: number,
  roleId: number,
  createdBy: number,
): Promise<MusicAssignment> {
  const planCtx = await fetchPlanContext(eventRefId);
  if (!planCtx) throw new Error('event_not_found');

  const memberExists = await query(
    `SELECT id, name, first_name, last_name, avatar_url FROM members WHERE id = $1 AND is_active = TRUE`,
    [memberId],
  );
  const memberRow = memberExists.rows[0] as Record<string, unknown> | undefined;
  if (!memberRow) throw new Error('member_not_found');

  const roleExists = await query(`SELECT * FROM music_roles WHERE id = $1 AND is_active = TRUE`, [roleId]);
  const roleRow = roleExists.rows[0] as Record<string, unknown> | undefined;
  if (!roleRow) throw new Error('role_not_found');

  const existingSameRole = await query(
    `SELECT id FROM music_assignments WHERE event_ref_id = $1 AND role_id = $2 LIMIT 1`,
    [eventRefId, roleId],
  );
  if (existingSameRole.rows[0]) {
    throw new Error('role_taken');
  }

  try {
    const result = await query(
      `INSERT INTO music_assignments (event_ref_id, member_id, role_id, status, created_by)
       VALUES ($1, $2, $3, 'assigned', $4)
       RETURNING id, event_ref_id, member_id, role_id, status, notes`,
      [eventRefId, memberId, roleId, createdBy],
    );
    const row = result.rows[0] as Record<string, unknown>;
    const role = mapRoleRow(roleRow);
    const assignment: MusicAssignment = {
      id: Number(row.id),
      event_ref_id: eventRefId,
      member_id: memberId,
      role_id: roleId,
      status: 'assigned',
      notes: null,
      member: {
        id: memberId,
        name: memberDisplayName(memberRow),
        avatar_url: memberRow.avatar_url == null ? null : String(memberRow.avatar_url),
      },
      role,
    };

    void notifyAssignment(
      memberId,
      'assignment',
      {
        roleName: role.name,
        eventTitle: planCtx.title,
        eventDate: planCtx.event_date,
        startTime: planCtx.start_time,
      },
      { assignmentId: assignment.id, eventRefId, roleId },
    ).catch((e) => console.warn('[music-schedule] assignment push failed', e));

    return assignment;
  } catch (e) {
    const code =
      e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code ?? '') : '';
    if (code === '23505') throw new Error('duplicate_assignment');
    throw e;
  }
}

export async function removeAssignment(assignmentId: number): Promise<void> {
  const existing = await getAssignmentById(assignmentId);
  if (!existing) throw new Error('not_found');

  const planCtx = await fetchPlanContext(existing.event_ref_id);

  const result = await query(`DELETE FROM music_assignments WHERE id = $1`, [assignmentId]);
  if ((result.rowCount ?? 0) === 0) {
    throw new Error('not_found');
  }

  if (planCtx) {
    void notifyAssignment(
      existing.member_id,
      'cancellation',
      {
        roleName: existing.role.name,
        eventTitle: planCtx.title,
        eventDate: planCtx.event_date,
        startTime: planCtx.start_time,
      },
    ).catch((e) => console.warn('[music-schedule] cancellation push failed', e));
  }
}

export async function updateAssignmentStatus(
  assignmentId: number,
  status: string,
): Promise<void> {
  const normalized = status.trim() as AssignmentStatus;
  if (!ASSIGNMENT_STATUSES.has(normalized)) {
    throw new Error('invalid_status');
  }

  const existingResult = await query(
    `SELECT
       a.id,
       a.event_ref_id,
       a.member_id,
       a.role_id,
       a.status,
       a.created_by,
       m.name,
       m.first_name,
       m.last_name,
       r.name AS role_name
     FROM music_assignments a
     JOIN members m ON m.id = a.member_id
     JOIN music_roles r ON r.id = a.role_id
     WHERE a.id = $1
     LIMIT 1`,
    [assignmentId],
  );
  const existingRow = existingResult.rows[0] as Record<string, unknown> | undefined;
  if (!existingRow) {
    throw new Error('not_found');
  }

  const previousStatus = String(existingRow.status ?? 'assigned') as AssignmentStatus;

  const result = await query(
    `UPDATE music_assignments SET status = $2 WHERE id = $1`,
    [assignmentId, normalized],
  );
  if ((result.rowCount ?? 0) === 0) {
    throw new Error('not_found');
  }

  if (normalized !== 'declined' || previousStatus === 'declined') {
    return;
  }

  const createdBy =
    existingRow.created_by == null ? null : Number(existingRow.created_by);
  const assigneeId = Number(existingRow.member_id);
  if (createdBy == null || !Number.isFinite(createdBy) || createdBy === assigneeId) {
    return;
  }

  const eventRefId = Number(existingRow.event_ref_id);
  const planCtx = await fetchPlanContext(eventRefId);
  if (!planCtx) return;

  void notifyAssignment(
    createdBy,
    'declined_to_manager',
    {
      roleName: String(existingRow.role_name ?? ''),
      eventTitle: planCtx.title,
      eventDate: planCtx.event_date,
      startTime: planCtx.start_time,
      memberName: memberDisplayName(existingRow),
    },
    {
      assignmentId,
      eventRefId,
      roleId: Number(existingRow.role_id),
    },
  ).catch((e) => console.warn('[music-schedule] decline manager push failed', e));
}

export async function getAssignmentById(assignmentId: number): Promise<MusicAssignment | null> {
  const result = await query(
    `SELECT
       a.id,
       a.event_ref_id,
       a.member_id,
       a.role_id,
       a.status,
       a.notes,
       m.name,
       m.first_name,
       m.last_name,
       m.avatar_url,
       r.name AS role_name,
       r.color AS role_color,
       r.icon AS role_icon,
       r.sort_order AS role_sort_order,
       r.is_active AS role_is_active,
       r.ministry_direction_filter AS role_ministry_direction_filter,
       r.ministry_role_filter AS role_ministry_role_filter
     FROM music_assignments a
     JOIN members m ON m.id = a.member_id
     JOIN music_roles r ON r.id = a.role_id
     WHERE a.id = $1
     LIMIT 1`,
    [assignmentId],
  );
  const raw = result.rows[0] as Record<string, unknown> | undefined;
  if (!raw) return null;
  return {
    id: Number(raw.id),
    event_ref_id: Number(raw.event_ref_id),
    member_id: Number(raw.member_id),
    role_id: Number(raw.role_id),
    status: String(raw.status ?? 'assigned') as AssignmentStatus,
    notes: raw.notes == null ? null : String(raw.notes),
    member: {
      id: Number(raw.member_id),
      name: memberDisplayName(raw),
      avatar_url: raw.avatar_url == null ? null : String(raw.avatar_url),
    },
    role: {
      id: Number(raw.role_id),
      name: String(raw.role_name ?? ''),
      color: String(raw.role_color ?? '#6366f1'),
      icon: raw.role_icon == null ? null : String(raw.role_icon),
      sort_order: Number(raw.role_sort_order ?? 0),
      is_active: raw.role_is_active !== false,
      ministry_direction_filter:
        raw.role_ministry_direction_filter == null
          ? null
          : String(raw.role_ministry_direction_filter),
      ministry_role_filter:
        raw.role_ministry_role_filter == null ? null : String(raw.role_ministry_role_filter),
    },
  };
}

export async function getMemberSchedule(
  memberId: number,
  from: Date,
  to: Date,
): Promise<EventWithAssignments[]> {
  const fromYmd = dateToYmdLocal(from);
  const toYmd = dateToYmdLocal(to);

  const result = await query(
    `${PLAN_SELECT}
     JOIN music_assignments a ON a.event_ref_id = p.id
     WHERE a.member_id = $1
       AND p.service_date >= $2::date
       AND p.service_date <= $3::date
       AND p.is_archived = FALSE
     ORDER BY p.service_date ASC, p.start_time ASC NULLS LAST, p.id ASC`,
    [memberId, fromYmd, toYmd],
  );

  const events = (result.rows as Record<string, unknown>[]).map(mapEventRow);
  const withAll = await attachAssignments(events);
  return withAll.map((event) => ({
    ...event,
    assignments: event.assignments.filter((a) => a.member_id === memberId),
  }));
}

export async function getMemberAssignmentsOnDate(
  memberId: number,
  eventDate: string,
  excludePlanId?: number,
): Promise<Array<{ event_ref_id: number; title: string; role_name: string }>> {
  const ymd = parseDateYmd(eventDate);
  if (!ymd) return [];

  const result = await query(
    `SELECT
       p.id AS event_ref_id,
       COALESCE(NULLIF(TRIM(ce.title), ''), NULLIF(TRIM(t.name), ''), 'Служение') AS title,
       r.name AS role_name
     FROM music_assignments a
     JOIN service_plans p ON p.id = a.event_ref_id
     LEFT JOIN service_templates t ON t.id = p.template_id
     LEFT JOIN church_events ce ON ce.id = p.church_event_id
     JOIN music_roles r ON r.id = a.role_id
     WHERE a.member_id = $1
       AND p.service_date = $2::date
       AND ($3::bigint IS NULL OR p.id <> $3)`,
    [memberId, ymd, excludePlanId ?? null],
  );

  return (result.rows as Array<{ event_ref_id: unknown; title: unknown; role_name: unknown }>).map(
    (row) => ({
      event_ref_id: Number(row.event_ref_id),
      title: String(row.title ?? ''),
      role_name: String(row.role_name ?? ''),
    }),
  );
}

/** Напоминания за сутки до службы (confirmed / assigned). */
export async function sendMusicScheduleReminders(): Promise<number> {
  const result = await query(
    `SELECT
       a.id AS assignment_id,
       a.member_id,
       a.status,
       r.name AS role_name,
       COALESCE(NULLIF(TRIM(ce.title), ''), NULLIF(TRIM(t.name), ''), 'Служение') AS event_title,
       p.service_date::text AS event_date,
       p.start_time
     FROM music_assignments a
     JOIN service_plans p ON p.id = a.event_ref_id
     LEFT JOIN service_templates t ON t.id = p.template_id
     LEFT JOIN church_events ce ON ce.id = p.church_event_id
     JOIN music_roles r ON r.id = a.role_id
     WHERE p.service_date = (CURRENT_DATE + INTERVAL '1 day')::date
       AND p.is_archived = FALSE
       AND a.status IN ('assigned', 'confirmed', 'pending')
       AND a.reminder_sent_at IS NULL`,
  );

  let sent = 0;
  for (const row of result.rows as Array<Record<string, unknown>>) {
    const assignmentId = Number(row.assignment_id);
    const memberId = Number(row.member_id);
    try {
      await notifyAssignment(
        memberId,
        'reminder',
        {
          roleName: String(row.role_name ?? ''),
          eventTitle: String(row.event_title ?? 'Служение'),
          eventDate: String(row.event_date ?? '').slice(0, 10),
          startTime: formatTimeHm(row.start_time),
        },
      );
      await query(
        `UPDATE music_assignments SET reminder_sent_at = NOW() WHERE id = $1`,
        [assignmentId],
      );
      sent += 1;
    } catch (e) {
      console.warn(`[music-schedule] reminder push failed for assignment ${assignmentId}`, e);
    }
  }
  return sent;
}

export async function getRoles(): Promise<MusicRole[]> {
  const result = await query(
    `SELECT * FROM music_roles WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC`,
  );
  return (result.rows as Record<string, unknown>[]).map(mapRoleRow);
}

export async function getAllRolesIncludingInactive(): Promise<MusicRole[]> {
  const result = await query(`SELECT * FROM music_roles ORDER BY sort_order ASC, id ASC`);
  return (result.rows as Record<string, unknown>[]).map(mapRoleRow);
}

export async function createRole(input: CreateRoleInput): Promise<MusicRole> {
  const name = input.name.trim();
  if (!name) throw new Error('invalid_input');

  const maxOrder = await query(`SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM music_roles`);
  const nextOrder =
    input.sort_order ?? Number((maxOrder.rows[0] as { m?: number } | undefined)?.m ?? 0) + 1;

  const result = await query(
    `INSERT INTO music_roles (name, color, icon, sort_order, is_active, ministry_direction_filter, ministry_role_filter)
     VALUES ($1, $2, $3, $4, COALESCE($5, TRUE), $6, $7)
     RETURNING *`,
    [
      name,
      input.color?.trim() || '#6366f1',
      input.icon?.trim() || null,
      nextOrder,
      input.is_active ?? true,
      input.ministry_direction_filter?.trim() || null,
      input.ministry_role_filter?.trim() || null,
    ],
  );
  return mapRoleRow(result.rows[0] as Record<string, unknown>);
}

export async function updateRole(id: number, input: UpdateRoleInput): Promise<MusicRole> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('invalid_input');
    fields.push(`name = $${idx++}`);
    values.push(name);
  }
  if (input.color !== undefined) {
    fields.push(`color = $${idx++}`);
    values.push(input.color.trim() || '#6366f1');
  }
  if (input.icon !== undefined) {
    fields.push(`icon = $${idx++}`);
    values.push(input.icon?.trim() || null);
  }
  if (input.sort_order !== undefined) {
    fields.push(`sort_order = $${idx++}`);
    values.push(input.sort_order);
  }
  if (input.is_active !== undefined) {
    fields.push(`is_active = $${idx++}`);
    values.push(input.is_active);
  }
  if (input.ministry_direction_filter !== undefined) {
    fields.push(`ministry_direction_filter = $${idx++}`);
    values.push(input.ministry_direction_filter?.trim() || null);
  }
  if (input.ministry_role_filter !== undefined) {
    fields.push(`ministry_role_filter = $${idx++}`);
    values.push(input.ministry_role_filter?.trim() || null);
  }

  if (fields.length === 0) {
    const row = await query(`SELECT * FROM music_roles WHERE id = $1`, [id]);
    if (!row.rows[0]) throw new Error('not_found');
    return mapRoleRow(row.rows[0] as Record<string, unknown>);
  }

  values.push(id);
  const result = await query(
    `UPDATE music_roles SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  );
  if (!result.rows[0]) throw new Error('not_found');
  return mapRoleRow(result.rows[0] as Record<string, unknown>);
}

export async function deleteRole(id: number): Promise<void> {
  const used = await query(`SELECT 1 FROM music_assignments WHERE role_id = $1 LIMIT 1`, [id]);
  if (used.rows[0]) {
    throw new Error('role_in_use');
  }
  const result = await query(`DELETE FROM music_roles WHERE id = $1`, [id]);
  if ((result.rowCount ?? 0) === 0) {
    throw new Error('not_found');
  }
}

export async function reorderRoles(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  for (let i = 0; i < ids.length; i += 1) {
    const id = parsePositiveInt(ids[i]);
    if (id == null) continue;
    await query(`UPDATE music_roles SET sort_order = $2 WHERE id = $1`, [id, i + 1]);
  }
}

export async function getMusicMembers(roleId?: number): Promise<MusicScheduleMember[]> {
  const directionClause = MUSIC_MEMBER_DIRECTION_PATTERNS.map(
    (_, i) => `lower(COALESCE(m.ministry_direction, '')) LIKE $${i + 1}`,
  ).join(' OR ');

  const mapMemberRow = (row: Record<string, unknown>): MusicScheduleMember => ({
    id: Number(row.id),
    name: memberDisplayName(row),
    avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
    ministry_direction: row.ministry_direction == null ? null : String(row.ministry_direction),
    ministry_role: row.ministry_role == null ? null : String(row.ministry_role),
    phone: row.phone_number == null ? null : String(row.phone_number),
    email: row.email == null ? null : String(row.email),
  });

  const MEMBER_SELECT = `
       m.id,
       m.name,
       m.first_name,
       m.last_name,
       m.avatar_url,
       m.ministry_direction,
       m.ministry_role,
       m.phone_number,
       m.email`;

  const filtered = await query(
    `SELECT ${MEMBER_SELECT}
     FROM members m
     WHERE m.is_active = TRUE
       AND (${directionClause})
     ORDER BY m.first_name NULLS LAST, m.last_name NULLS LAST, m.name ASC`,
    MUSIC_MEMBER_DIRECTION_PATTERNS,
  );

  let rows = filtered.rows as Record<string, unknown>[];
  if (rows.length === 0) {
    const all = await query(
      `SELECT ${MEMBER_SELECT}
       FROM members m
       WHERE m.is_active = TRUE
       ORDER BY m.first_name NULLS LAST, m.last_name NULLS LAST, m.name ASC`,
    );
    rows = all.rows as Record<string, unknown>[];
  }

  let members = rows.map(mapMemberRow);

  if (roleId != null && roleId > 0) {
    const roleResult = await query(`SELECT name, ministry_role_filter FROM music_roles WHERE id = $1 LIMIT 1`, [
      roleId,
    ]);
    const roleRow = roleResult.rows[0] as { name?: string; ministry_role_filter?: string | null } | undefined;
    if (roleRow) {
      const matchTokens = musicRoleMemberMatchTokens({
        name: String(roleRow.name ?? ''),
        ministry_role_filter: roleRow.ministry_role_filter ?? null,
      });
      const matched = members.filter((m) =>
        matchTokens.some((token) => memberHasMinistryRole(m.ministry_role, token)),
      );
      if (matched.length > 0) {
        members = matched;
      }
    }
  }

  return members;
}

export { parseDateYmd, parsePositiveInt };
