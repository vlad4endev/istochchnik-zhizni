import { query } from '../config/db';

export type SundayScheduleSlotRow = {
  service_date: string;
  leader_member_id: number | null;
  preacher_member_id: number | null;
};

let schemaReady = false;

export async function ensureSundayScheduleSlotsSchema(): Promise<void> {
  if (schemaReady) return;
  await query(
    `create table if not exists public.sunday_schedule_slots (
       service_date date primary key,
       leader_member_id integer references public.members (id) on delete set null,
       preacher_member_id integer references public.members (id) on delete set null,
       created_at timestamptz not null default now(),
       updated_at timestamptz not null default now()
     )`,
  );
  await query(
    `create index if not exists idx_sunday_schedule_slots_leader
     on public.sunday_schedule_slots (leader_member_id)`,
  );
  await query(
    `create index if not exists idx_sunday_schedule_slots_preacher
     on public.sunday_schedule_slots (preacher_member_id)`,
  );
  schemaReady = true;
}

function mapSlotRow(row: Record<string, unknown>): SundayScheduleSlotRow {
  return {
    service_date: String(row.service_date),
    leader_member_id: row.leader_member_id == null ? null : Number(row.leader_member_id),
    preacher_member_id: row.preacher_member_id == null ? null : Number(row.preacher_member_id),
  };
}

export async function getSundayScheduleSlot(serviceDate: string): Promise<SundayScheduleSlotRow | null> {
  await ensureSundayScheduleSlotsSchema();
  const res = await query(
    `select service_date::text as service_date, leader_member_id, preacher_member_id
     from public.sunday_schedule_slots
     where service_date = $1::date
     limit 1`,
    [serviceDate],
  );
  const row = res.rows[0] as Record<string, unknown> | undefined;
  return row ? mapSlotRow(row) : null;
}

export async function listSundayScheduleSlots(input: {
  from?: string;
  to?: string;
}): Promise<SundayScheduleSlotRow[]> {
  await ensureSundayScheduleSlotsSchema();
  const params: unknown[] = [];
  const where: string[] = [];
  if (input.from) {
    params.push(input.from);
    where.push(`service_date >= $${params.length}::date`);
  }
  if (input.to) {
    params.push(input.to);
    where.push(`service_date <= $${params.length}::date`);
  }
  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const res = await query(
    `select service_date::text as service_date, leader_member_id, preacher_member_id
     from public.sunday_schedule_slots
     ${whereSql}
     order by service_date asc`,
    params,
  );
  return (res.rows as Record<string, unknown>[]).map(mapSlotRow);
}

export async function upsertSundayScheduleSlot(
  serviceDate: string,
  patch: {
    leader_member_id?: number | null;
    preacher_member_id?: number | null;
  },
): Promise<SundayScheduleSlotRow> {
  await ensureSundayScheduleSlotsSchema();
  const existing = await getSundayScheduleSlot(serviceDate);
  const leader =
    patch.leader_member_id !== undefined ? patch.leader_member_id : (existing?.leader_member_id ?? null);
  const preacher =
    patch.preacher_member_id !== undefined
      ? patch.preacher_member_id
      : (existing?.preacher_member_id ?? null);

  const res = await query(
    `insert into public.sunday_schedule_slots (service_date, leader_member_id, preacher_member_id)
     values ($1::date, $2, $3)
     on conflict (service_date) do update
       set leader_member_id = excluded.leader_member_id,
           preacher_member_id = excluded.preacher_member_id,
           updated_at = now()
     returning service_date::text as service_date, leader_member_id, preacher_member_id`,
    [serviceDate, leader, preacher],
  );
  return mapSlotRow(res.rows[0] as Record<string, unknown>);
}
