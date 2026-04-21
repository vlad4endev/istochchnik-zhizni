import { pool, query } from '../config/db';

export type PlannerBlockType = {
  id: number;
  code: string;
  name: string;
  kind: 'song' | 'text' | 'speaker' | 'custom';
  icon: string | null;
  default_duration_minutes: number;
};

export type PlannerTemplateListItem = {
  id: number;
  name: string;
  description: string | null;
  recurrence_rule: Record<string, unknown>;
  default_start_time: string;
  is_active: boolean;
};

export type PlannerTemplateBlock = {
  id: number;
  template_id: number;
  block_type_id: number;
  title: string;
  order_index: number;
  duration_minutes: number;
  default_song_id: number | null;
  default_content_json: Record<string, unknown>;
};

export type PlannerTemplateDetails = PlannerTemplateListItem & {
  blocks: PlannerTemplateBlock[];
};

export type PlannerPlanListItem = {
  id: number;
  template_id: number | null;
  service_date: string;
  start_time: string;
  status: 'draft' | 'published';
  leader_member_id: number | null;
  preacher_member_id: number | null;
  total_duration_minutes: number;
  current_block_id: number | null;
  share_token: string;
  blocks_count: number;
  template_name: string | null;
};

export type PlannerBlock = {
  id: number;
  service_plan_id: number;
  block_type_id: number;
  title: string;
  order_index: number;
  duration_minutes: number;
  assigned_member_id: number | null;
  song_id: number | null;
  content_json: Record<string, unknown>;
};

export type PlannerPlanDetails = PlannerPlanListItem & {
  notes: string | null;
  created_at: string;
  updated_at: string;
  blocks: PlannerBlock[];
};

type DbRecord = Record<string, unknown>;

let plannerSchemaInitOnce: Promise<void> | null = null;

async function ensurePlannerSchema(): Promise<void> {
  if (!plannerSchemaInitOnce) {
    plannerSchemaInitOnce = (async () => {
      await query(
        `create table if not exists public.block_types (
           id smallserial primary key,
           code varchar(64) not null unique,
           name varchar(120) not null,
           kind varchar(32) not null check (kind in ('song', 'text', 'speaker', 'custom')),
           icon varchar(64),
           default_duration_minutes smallint not null default 5 check (default_duration_minutes > 0),
           created_at timestamptz not null default now()
         )`,
      );

      await query(
        `create table if not exists public.service_templates (
           id bigserial primary key,
           name varchar(255) not null,
           description text,
           recurrence_rule jsonb not null default '{}'::jsonb,
           default_start_time time not null default '10:00',
           is_active boolean not null default true,
           created_by_member_id integer references public.members (id) on delete set null,
           created_at timestamptz not null default now(),
           updated_at timestamptz not null default now()
         )`,
      );

      await query(
        `create table if not exists public.service_template_blocks (
           id bigserial primary key,
           template_id bigint not null references public.service_templates (id) on delete cascade,
           block_type_id smallint not null references public.block_types (id) on delete restrict,
           title varchar(255) not null default '',
           order_index integer not null check (order_index >= 0),
           duration_minutes smallint not null default 5 check (duration_minutes > 0),
           default_song_id bigint,
           default_content_json jsonb not null default '{}'::jsonb,
           created_at timestamptz not null default now(),
           unique (template_id, order_index)
         )`,
      );

      await query(
        `create table if not exists public.service_plans (
           id bigserial primary key,
           template_id bigint references public.service_templates (id) on delete set null,
           service_date date not null,
           start_time time not null default '10:00',
           status varchar(20) not null default 'draft' check (status in ('draft', 'published')),
           leader_member_id integer references public.members (id) on delete set null,
           preacher_member_id integer references public.members (id) on delete set null,
           total_duration_minutes integer not null default 0 check (total_duration_minutes >= 0),
           current_block_id bigint,
           share_token uuid not null default gen_random_uuid() unique,
           church_event_id bigint,
           notes text,
           created_by_member_id integer references public.members (id) on delete set null,
           created_at timestamptz not null default now(),
           updated_at timestamptz not null default now(),
           unique (template_id, service_date)
         )`,
      );

      await query(
        `create table if not exists public.service_blocks (
           id bigserial primary key,
           service_plan_id bigint not null references public.service_plans (id) on delete cascade,
           block_type_id smallint not null references public.block_types (id) on delete restrict,
           title varchar(255) not null default '',
           order_index integer not null check (order_index >= 0),
           duration_minutes smallint not null default 5 check (duration_minutes > 0),
           assigned_member_id integer references public.members (id) on delete set null,
           song_id bigint,
           content_json jsonb not null default '{}'::jsonb,
           source_template_block_id bigint references public.service_template_blocks (id) on delete set null,
           created_at timestamptz not null default now(),
           unique (service_plan_id, order_index)
         )`,
      );

      await query(
        `insert into public.block_types (code, name, kind, icon, default_duration_minutes)
         values
           ('prayer', 'Молитва', 'text', 'hands-praying', 5),
           ('song', 'Песня', 'song', 'music', 6),
           ('scripture', 'Чтение Писания', 'text', 'book-bible', 5),
           ('sermon', 'Проповедь', 'speaker', 'person-chalkboard', 35),
           ('announcements', 'Объявления', 'text', 'bullhorn', 5),
           ('offering', 'Сбор пожертвований', 'custom', 'hand-holding-dollar', 3),
           ('custom', 'Произвольный блок', 'custom', 'puzzle-piece', 5)
         on conflict (code) do nothing`,
      );
    })().catch((e) => {
      plannerSchemaInitOnce = null;
      throw e;
    });
  }
  await plannerSchemaInitOnce;
}

function asObject(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return v as Record<string, unknown>;
}

function toTimeHm(v: unknown, fallback = '10:00'): string {
  const raw = String(v ?? '').trim();
  const m = /^(\d{2}:\d{2})/.exec(raw);
  return m?.[1] ?? fallback;
}

function mapPlanRow(row: DbRecord): PlannerPlanListItem {
  return {
    id: Number(row.id),
    template_id: row.template_id == null ? null : Number(row.template_id),
    service_date: String(row.service_date ?? ''),
    start_time: toTimeHm(row.start_time),
    status: row.status === 'published' ? 'published' : 'draft',
    leader_member_id: row.leader_member_id == null ? null : Number(row.leader_member_id),
    preacher_member_id: row.preacher_member_id == null ? null : Number(row.preacher_member_id),
    total_duration_minutes: Number(row.total_duration_minutes ?? 0),
    current_block_id: row.current_block_id == null ? null : Number(row.current_block_id),
    share_token: String(row.share_token ?? ''),
    blocks_count: Number(row.blocks_count ?? 0),
    template_name: row.template_name == null ? null : String(row.template_name),
  };
}

function mapBlockRow(row: DbRecord): PlannerBlock {
  return {
    id: Number(row.id),
    service_plan_id: Number(row.service_plan_id),
    block_type_id: Number(row.block_type_id),
    title: String(row.title ?? ''),
    order_index: Number(row.order_index ?? 0),
    duration_minutes: Number(row.duration_minutes ?? 0),
    assigned_member_id: row.assigned_member_id == null ? null : Number(row.assigned_member_id),
    song_id: row.song_id == null ? null : Number(row.song_id),
    content_json: asObject(row.content_json),
  };
}

function mapTemplateBlockRow(row: DbRecord): PlannerTemplateBlock {
  return {
    id: Number(row.id),
    template_id: Number(row.template_id),
    block_type_id: Number(row.block_type_id),
    title: String(row.title ?? ''),
    order_index: Number(row.order_index ?? 0),
    duration_minutes: Number(row.duration_minutes ?? 5),
    default_song_id: row.default_song_id == null ? null : Number(row.default_song_id),
    default_content_json: asObject(row.default_content_json),
  };
}

export async function listBlockTypes(): Promise<PlannerBlockType[]> {
  await ensurePlannerSchema();
  const { rows } = await query(
    `select id, code, name, kind, icon, default_duration_minutes
     from public.block_types
     order by id asc`,
  );
  return rows.map((r) => ({
    id: Number((r as DbRecord).id),
    code: String((r as DbRecord).code ?? ''),
    name: String((r as DbRecord).name ?? ''),
    kind: ((r as DbRecord).kind as PlannerBlockType['kind']) || 'custom',
    icon: (r as DbRecord).icon == null ? null : String((r as DbRecord).icon),
    default_duration_minutes: Number((r as DbRecord).default_duration_minutes ?? 5),
  }));
}

export async function listTemplates(): Promise<PlannerTemplateListItem[]> {
  await ensurePlannerSchema();
  const { rows } = await query(
    `select id, name, description, recurrence_rule, default_start_time, is_active
     from public.service_templates
     order by created_at desc, id desc`,
  );
  return rows.map((r) => {
    const row = r as DbRecord;
    return {
      id: Number(row.id),
      name: String(row.name ?? ''),
      description: row.description == null ? null : String(row.description),
      recurrence_rule: asObject(row.recurrence_rule),
      default_start_time: toTimeHm(row.default_start_time),
      is_active: Boolean(row.is_active),
    };
  });
}

export async function getTemplateDetails(templateId: number): Promise<PlannerTemplateDetails | null> {
  await ensurePlannerSchema();
  const tRes = await query(
    `select id, name, description, recurrence_rule, default_start_time, is_active
     from public.service_templates
     where id = $1
     limit 1`,
    [templateId],
  );
  const row = tRes.rows[0] as DbRecord | undefined;
  if (!row) return null;
  const bRes = await query(
    `select id, template_id, block_type_id, title, order_index, duration_minutes, default_song_id, default_content_json
     from public.service_template_blocks
     where template_id = $1
     order by order_index asc, id asc`,
    [templateId],
  );
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    description: row.description == null ? null : String(row.description),
    recurrence_rule: asObject(row.recurrence_rule),
    default_start_time: toTimeHm(row.default_start_time),
    is_active: Boolean(row.is_active),
    blocks: bRes.rows.map((r) => mapTemplateBlockRow(r as DbRecord)),
  };
}

export async function listPlans(input: { from?: string; to?: string }): Promise<PlannerPlanListItem[]> {
  await ensurePlannerSchema();
  const params: unknown[] = [];
  const where: string[] = [];
  if (input.from) {
    params.push(input.from);
    where.push(`p.service_date >= $${params.length}::date`);
  }
  if (input.to) {
    params.push(input.to);
    where.push(`p.service_date <= $${params.length}::date`);
  }
  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const { rows } = await query(
    `select
       p.id, p.template_id, p.service_date::text as service_date, p.start_time, p.status,
       p.leader_member_id, p.preacher_member_id, p.total_duration_minutes, p.current_block_id,
       p.share_token::text as share_token,
       t.name as template_name,
       coalesce(count(b.id), 0) as blocks_count
     from public.service_plans p
     left join public.service_templates t on t.id = p.template_id
     left join public.service_blocks b on b.service_plan_id = p.id
     ${whereSql}
     group by p.id, t.name
     order by p.service_date desc, p.start_time asc, p.id desc`,
    params,
  );
  return rows.map((row) => mapPlanRow(row as DbRecord));
}

export async function getPlanDetails(planId: number): Promise<PlannerPlanDetails | null> {
  await ensurePlannerSchema();
  const planRes = await query(
    `select
       p.id, p.template_id, p.service_date::text as service_date, p.start_time, p.status,
       p.leader_member_id, p.preacher_member_id, p.total_duration_minutes, p.current_block_id,
       p.share_token::text as share_token, p.notes, p.created_at::text as created_at, p.updated_at::text as updated_at,
       t.name as template_name,
       (select count(*) from public.service_blocks b where b.service_plan_id = p.id) as blocks_count
     from public.service_plans p
     left join public.service_templates t on t.id = p.template_id
     where p.id = $1
     limit 1`,
    [planId],
  );
  const row = planRes.rows[0] as DbRecord | undefined;
  if (!row) return null;

  const blocksRes = await query(
    `select id, service_plan_id, block_type_id, title, order_index, duration_minutes, assigned_member_id, song_id, content_json
     from public.service_blocks
     where service_plan_id = $1
     order by order_index asc, id asc`,
    [planId],
  );

  const base = mapPlanRow(row);
  return {
    ...base,
    notes: row.notes == null ? null : String(row.notes),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
    blocks: blocksRes.rows.map((r) => mapBlockRow(r as DbRecord)),
  };
}

export async function createTemplate(input: {
  name: string;
  description: string | null;
  recurrence_rule: Record<string, unknown>;
  default_start_time: string;
  blocks: Array<{
    block_type_id: number;
    title: string;
    order_index: number;
    duration_minutes: number;
    default_song_id: number | null;
    default_content_json: Record<string, unknown>;
  }>;
  created_by_member_id: number;
}): Promise<number> {
  await ensurePlannerSchema();
  if (!pool) throw new Error('Database pool not configured');
  const client = await pool.connect();
  try {
    await client.query('begin');
    const templateRes = await client.query(
      `insert into public.service_templates
       (name, description, recurrence_rule, default_start_time, created_by_member_id)
       values ($1, $2, $3::jsonb, $4::time, $5)
       returning id`,
      [
        input.name,
        input.description,
        JSON.stringify(input.recurrence_rule ?? {}),
        input.default_start_time,
        input.created_by_member_id,
      ],
    );
    const templateId = Number((templateRes.rows[0] as DbRecord).id);
    for (const block of input.blocks) {
      await client.query(
        `insert into public.service_template_blocks
         (template_id, block_type_id, title, order_index, duration_minutes, default_song_id, default_content_json)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          templateId,
          block.block_type_id,
          block.title,
          block.order_index,
          block.duration_minutes,
          block.default_song_id,
          JSON.stringify(block.default_content_json ?? {}),
        ],
      );
    }
    await client.query('commit');
    return templateId;
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

export async function patchTemplate(
  templateId: number,
  input: {
    name: string;
    description: string | null;
    recurrence_rule: Record<string, unknown>;
    default_start_time: string;
    is_active: boolean;
    blocks: Array<{
      block_type_id: number;
      title: string;
      order_index: number;
      duration_minutes: number;
      default_song_id: number | null;
      default_content_json: Record<string, unknown>;
    }>;
  },
): Promise<boolean> {
  await ensurePlannerSchema();
  if (!pool) throw new Error('Database pool not configured');
  const client = await pool.connect();
  try {
    await client.query('begin');
    const upd = await client.query(
      `update public.service_templates
       set name = $1,
           description = $2,
           recurrence_rule = $3::jsonb,
           default_start_time = $4::time,
           is_active = $5,
           updated_at = now()
       where id = $6`,
      [
        input.name,
        input.description,
        JSON.stringify(input.recurrence_rule ?? {}),
        input.default_start_time,
        input.is_active,
        templateId,
      ],
    );
    if ((upd.rowCount ?? 0) === 0) {
      await client.query('rollback');
      return false;
    }

    await client.query(`delete from public.service_template_blocks where template_id = $1`, [templateId]);
    for (const block of input.blocks) {
      await client.query(
        `insert into public.service_template_blocks
         (template_id, block_type_id, title, order_index, duration_minutes, default_song_id, default_content_json)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          templateId,
          block.block_type_id,
          block.title,
          block.order_index,
          block.duration_minutes,
          block.default_song_id,
          JSON.stringify(block.default_content_json ?? {}),
        ],
      );
    }
    await client.query('commit');
    return true;
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

export async function createPlan(input: {
  template_id: number;
  service_date: string;
  start_time?: string;
  leader_member_id: number | null;
  preacher_member_id: number | null;
  created_by_member_id: number;
}): Promise<number> {
  await ensurePlannerSchema();
  if (!pool) throw new Error('Database pool not configured');
  const client = await pool.connect();
  try {
    await client.query('begin');
    const tplRes = await client.query(
      `select id, default_start_time
       from public.service_templates
       where id = $1 and is_active = true
       limit 1`,
      [input.template_id],
    );
    const tpl = tplRes.rows[0] as DbRecord | undefined;
    if (!tpl) {
      throw new Error('Template not found');
    }
    const startTime = input.start_time?.trim() || toTimeHm(tpl.default_start_time);

    const planRes = await client.query(
      `insert into public.service_plans
       (template_id, service_date, start_time, status, leader_member_id, preacher_member_id, created_by_member_id)
       values ($1, $2::date, $3::time, 'draft', $4, $5, $6)
       on conflict (template_id, service_date) do update
         set start_time = excluded.start_time,
             leader_member_id = coalesce(excluded.leader_member_id, public.service_plans.leader_member_id),
             preacher_member_id = coalesce(excluded.preacher_member_id, public.service_plans.preacher_member_id),
             updated_at = now()
       returning id`,
      [
        input.template_id,
        input.service_date,
        startTime,
        input.leader_member_id,
        input.preacher_member_id,
        input.created_by_member_id,
      ],
    );
    const planId = Number((planRes.rows[0] as DbRecord).id);

    const existingBlocks = await client.query(
      `select 1 from public.service_blocks where service_plan_id = $1 limit 1`,
      [planId],
    );
    if ((existingBlocks.rowCount ?? 0) === 0) {
      await client.query(
        `insert into public.service_blocks
         (service_plan_id, block_type_id, title, order_index, duration_minutes, assigned_member_id, song_id, content_json, source_template_block_id)
         select
           $1,
           tb.block_type_id,
           tb.title,
           tb.order_index,
           tb.duration_minutes,
           null,
           tb.default_song_id,
           tb.default_content_json,
           tb.id
         from public.service_template_blocks tb
         where tb.template_id = $2
         order by tb.order_index asc`,
        [planId, input.template_id],
      );
    }

    await client.query('commit');
    return planId;
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

export async function patchPlan(
  planId: number,
  patch: Partial<{
    service_date: string;
    start_time: string;
    status: 'draft' | 'published';
    leader_member_id: number | null;
    preacher_member_id: number | null;
    current_block_id: number | null;
    notes: string | null;
  }>,
): Promise<boolean> {
  await ensurePlannerSchema();
  const set: string[] = [];
  const values: unknown[] = [];
  const push = (sql: string, value: unknown) => {
    values.push(value);
    set.push(sql.replace('?', `$${values.length}`));
  };
  if (patch.service_date !== undefined) push('service_date = ?::date', patch.service_date);
  if (patch.start_time !== undefined) push('start_time = ?::time', patch.start_time);
  if (patch.status !== undefined) push('status = ?', patch.status);
  if (patch.leader_member_id !== undefined) push('leader_member_id = ?', patch.leader_member_id);
  if (patch.preacher_member_id !== undefined) push('preacher_member_id = ?', patch.preacher_member_id);
  if (patch.current_block_id !== undefined) push('current_block_id = ?', patch.current_block_id);
  if (patch.notes !== undefined) push('notes = ?', patch.notes);
  if (set.length === 0) return true;
  set.push('updated_at = now()');
  values.push(planId);
  const res = await query(
    `update public.service_plans
     set ${set.join(', ')}
     where id = $${values.length}`,
    values,
  );
  return (res.rowCount ?? 0) > 0;
}

export async function reorderBlocks(servicePlanId: number, orderedBlockIds: number[]): Promise<void> {
  await ensurePlannerSchema();
  if (!pool) throw new Error('Database pool not configured');
  const client = await pool.connect();
  try {
    await client.query('begin');

    const existingRes = await client.query(
      `select id from public.service_blocks where service_plan_id = $1 order by order_index asc`,
      [servicePlanId],
    );
    const existingIds = existingRes.rows.map((r) => Number((r as DbRecord).id)).sort((a, b) => a - b);
    const incoming = [...orderedBlockIds].sort((a, b) => a - b);
    if (existingIds.length !== incoming.length || existingIds.some((id, idx) => id !== incoming[idx])) {
      throw new Error('Ordered block ids do not match service plan blocks');
    }

    for (let i = 0; i < orderedBlockIds.length; i += 1) {
      await client.query(
        `update public.service_blocks
         set order_index = $1
         where id = $2 and service_plan_id = $3`,
        [i, orderedBlockIds[i], servicePlanId],
      );
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

export async function patchBlock(
  blockId: number,
  patch: Partial<{
    title: string;
    block_type_id: number;
    duration_minutes: number;
    assigned_member_id: number | null;
    song_id: number | null;
    content_json: Record<string, unknown>;
  }>,
): Promise<boolean> {
  await ensurePlannerSchema();
  const set: string[] = [];
  const values: unknown[] = [];
  const push = (sql: string, value: unknown) => {
    values.push(value);
    set.push(sql.replace('?', `$${values.length}`));
  };
  if (patch.title !== undefined) push('title = ?', patch.title);
  if (patch.block_type_id !== undefined) push('block_type_id = ?', patch.block_type_id);
  if (patch.duration_minutes !== undefined) push('duration_minutes = ?', patch.duration_minutes);
  if (patch.assigned_member_id !== undefined) push('assigned_member_id = ?', patch.assigned_member_id);
  if (patch.song_id !== undefined) push('song_id = ?', patch.song_id);
  if (patch.content_json !== undefined) {
    values.push(JSON.stringify(patch.content_json ?? {}));
    set.push(`content_json = $${values.length}::jsonb`);
  }
  if (set.length === 0) return true;
  values.push(blockId);
  const res = await query(
    `update public.service_blocks
     set ${set.join(', ')}
     where id = $${values.length}`,
    values,
  );
  return (res.rowCount ?? 0) > 0;
}
