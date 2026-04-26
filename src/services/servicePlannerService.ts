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
  is_archived: boolean;
  leader_member_id: number | null;
  preacher_member_id: number | null;
  total_duration_minutes: number;
  current_block_id: number | null;
  share_token: string;
  edit_token: string;
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
  last_edited_by_member_id: number | null;
  last_edited_at: string | null;
  last_edited_by_name: string | null;
  blocks: PlannerBlock[];
};

export type PublicPlannerPlanPayload = {
  plan: {
    id: number;
    service_date: string;
    start_time: string;
    status: 'draft' | 'published';
    total_duration_minutes: number;
    notes: string | null;
    share_token: string;
    template_name: string | null;
    leader_name: string | null;
    preacher_name: string | null;
  };
  blocks: Array<{
    id: number;
    order_index: number;
    title: string;
    duration_minutes: number;
    block_type_name: string | null;
    block_type_code: string | null;
    assigned_member_name: string | null;
    song_title: string | null;
    song_key: string | null;
    content_json: Record<string, unknown>;
  }>;
};

export type PublicEditablePlannerPlanPayload = {
  plan: {
    id: number;
    service_date: string;
    start_time: string;
    status: 'draft' | 'published';
    total_duration_minutes: number;
    notes: string | null;
    edit_token: string;
    template_name: string | null;
    leader_name: string | null;
    preacher_member_id: number | null;
    preacher_name: string | null;
  };
  blocks: Array<{
    id: number;
    block_type_id: number;
    order_index: number;
    title: string;
    duration_minutes: number;
    assigned_member_id: number | null;
    song_id: number | null;
    block_type_name: string | null;
    block_type_code: string | null;
    assigned_member_name: string | null;
    song_title: string | null;
    song_key: string | null;
    content_json: Record<string, unknown>;
  }>;
};

export type PublicEditablePlannerPlanMetaPayload = {
  block_types: Array<{
    id: number;
    code: string;
    name: string;
    kind: PlannerBlockType['kind'];
  }>;
  members: Array<{
    id: number;
    first_name: string | null;
    last_name: string | null;
    name: string;
    ministry_role: string | null;
    ministry_direction: string | null;
    app_role: string;
  }>;
  songs: Array<{
    id: number;
    title: string;
    default_key: string | null;
  }>;
};

type DbRecord = Record<string, unknown>;

function resolveTokenTtlDays(envName: string, fallbackDays: number): number {
  const raw = Number(process.env[envName] ?? fallbackDays);
  if (!Number.isFinite(raw)) return fallbackDays;
  return Math.min(3650, Math.max(1, Math.floor(raw)));
}

// SECURITY FIX: ограничиваем срок жизни публичных токенов, чтобы снизить риск долгоживущих утечек ссылок.
const SHARE_TOKEN_MAX_AGE_DAYS = resolveTokenTtlDays('PUBLIC_SHARE_TOKEN_MAX_AGE_DAYS', 365);
const EDIT_TOKEN_MAX_AGE_DAYS = resolveTokenTtlDays('PUBLIC_EDIT_TOKEN_MAX_AGE_DAYS', 30);

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
           is_archived boolean not null default false,
           leader_member_id integer references public.members (id) on delete set null,
           preacher_member_id integer references public.members (id) on delete set null,
           total_duration_minutes integer not null default 0 check (total_duration_minutes >= 0),
           current_block_id bigint,
           share_token uuid not null default gen_random_uuid() unique,
           share_token_issued_at timestamptz not null default now(),
           edit_token uuid not null default gen_random_uuid() unique,
           edit_token_issued_at timestamptz not null default now(),
           church_event_id bigint,
           notes text,
           created_by_member_id integer references public.members (id) on delete set null,
           created_at timestamptz not null default now(),
           updated_at timestamptz not null default now(),
           unique (template_id, service_date)
         )`,
      );

      await query(`alter table public.service_plans add column if not exists is_archived boolean not null default false`);
      await query(`alter table public.service_plans add column if not exists edit_token uuid`);
      await query(`update public.service_plans set edit_token = gen_random_uuid() where edit_token is null`);
      await query(`alter table public.service_plans alter column edit_token set default gen_random_uuid()`);
      await query(`alter table public.service_plans alter column edit_token set not null`);
      await query(`create unique index if not exists idx_service_plans_edit_token on public.service_plans (edit_token)`);
      // SECURITY FIX: срок жизни публичных токенов считаем от момента выдачи, а не от updated_at.
      await query(`alter table public.service_plans add column if not exists share_token_issued_at timestamptz`);
      await query(`alter table public.service_plans add column if not exists edit_token_issued_at timestamptz`);
      await query(`update public.service_plans set share_token_issued_at = coalesce(share_token_issued_at, created_at, now())`);
      await query(`update public.service_plans set edit_token_issued_at = coalesce(edit_token_issued_at, created_at, now())`);
      await query(`alter table public.service_plans alter column share_token_issued_at set default now()`);
      await query(`alter table public.service_plans alter column edit_token_issued_at set default now()`);
      await query(`alter table public.service_plans alter column share_token_issued_at set not null`);
      await query(`alter table public.service_plans alter column edit_token_issued_at set not null`);
      await query(`create index if not exists idx_service_plans_share_token_issued_at on public.service_plans (share_token_issued_at)`);
      await query(`create index if not exists idx_service_plans_edit_token_issued_at on public.service_plans (edit_token_issued_at)`);
      await query(
        `alter table public.service_plans add column if not exists last_edited_by_member_id integer references public.members (id) on delete set null`,
      );
      await query(`alter table public.service_plans add column if not exists last_edited_at timestamptz`);

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
           ('poem', 'Стих', 'speaker', 'book-open', 4),
           ('scripture', 'Чтение Писания', 'text', 'book-bible', 5),
           ('sermon', 'Проповедь', 'speaker', 'person-chalkboard', 35),
           ('announcements', 'Объявления', 'text', 'bullhorn', 5),
           ('offering', 'Сбор пожертвований', 'custom', 'hand-holding-dollar', 3),
           ('birthdays', 'Дни рождения', 'custom', 'cake-candles', 4),
           ('schedule', 'Расписание', 'text', 'calendar-days', 5),
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

type BirthdayWeekItem = {
  id: number;
  name: string;
  birth_date: string;
  week_date: string;
};

type BirthdayWeekPayload = {
  week_start: string;
  week_end: string;
  items: BirthdayWeekItem[];
};

type NextWeekScheduleItem = {
  id: number;
  title: string;
  event_date: string;
  event_time: string;
  description: string | null;
  category: string | null;
};

type NextWeekSchedulePayload = {
  week_start: string;
  week_end: string;
  items: NextWeekScheduleItem[];
};

function normalizeBirthDateYmd(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function birthdayForYear(birthDateYmd: string, year: number): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDateYmd);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeekMonday(baseDate: string): Date {
  const d = new Date(`${baseDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function normalizeTimeHm(raw: unknown): string {
  const value = String(raw ?? '').trim();
  const m = /^(\d{2}:\d{2})/.exec(value);
  return m?.[1] ?? '00:00';
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function formatYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function personName(row: { first_name?: unknown; last_name?: unknown; name?: unknown }): string {
  const first = String(row.first_name ?? '').trim();
  const last = String(row.last_name ?? '').trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  const fallback = String(row.name ?? '').trim();
  return fallback || 'Участник';
}

async function getWeekBirthdays(serviceDate: string): Promise<BirthdayWeekPayload> {
  const weekStart = startOfWeekMonday(serviceDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  const years = Array.from(new Set([weekStart.getFullYear(), weekEnd.getFullYear()]));

  const membersRes = await query(
    `select id, first_name, last_name, name, birth_date::text as birth_date
     from public.members
     where is_active = true
       and birth_date is not null`,
  );

  const items: BirthdayWeekItem[] = [];
  for (const rawRow of membersRes.rows) {
    const row = rawRow as DbRecord;
    const memberId = Number(row.id);
    if (!Number.isFinite(memberId)) continue;
    const birthDateYmd = normalizeBirthDateYmd(row.birth_date);
    if (!birthDateYmd) continue;
    let hit: Date | null = null;
    for (const year of years) {
      const candidate = birthdayForYear(birthDateYmd, year);
      if (!candidate) continue;
      if (candidate.getTime() >= weekStart.getTime() && candidate.getTime() <= weekEnd.getTime()) {
        hit = candidate;
        break;
      }
    }
    if (!hit) continue;
    items.push({
      id: memberId,
      name: personName(row),
      birth_date: birthDateYmd,
      week_date: formatYmdLocal(hit),
    });
  }

  items.sort((a, b) => {
    const byDate = a.week_date.localeCompare(b.week_date);
    if (byDate !== 0) return byDate;
    return a.name.localeCompare(b.name, 'ru');
  });

  return {
    week_start: formatYmdLocal(weekStart),
    week_end: formatYmdLocal(weekEnd),
    items,
  };
}

function withBirthdayWeek(
  content: Record<string, unknown>,
  payload: BirthdayWeekPayload,
): Record<string, unknown> {
  return {
    ...content,
    birthday_week_start: payload.week_start,
    birthday_week_end: payload.week_end,
    birthday_people: payload.items,
  };
}

function isWeeklyScheduleBlock(block: {
  title?: unknown;
  content_json?: unknown;
  block_type_code?: unknown;
}): boolean {
  return String(block.block_type_code ?? '').trim().toLowerCase() === 'schedule';
}

async function getNextWeekSchedule(serviceDate: string): Promise<NextWeekSchedulePayload> {
  const currentWeekStart = startOfWeekMonday(serviceDate);
  const weekStart = addDays(currentWeekStart, 7);
  const weekEnd = addDays(weekStart, 6);
  const weekStartYmd = formatYmdLocal(weekStart);
  const weekEndYmd = formatYmdLocal(weekEnd);

  const eventsRes = await query(
    `select
       id,
       title,
       description,
       event_date::text as event_date,
       to_char(event_time, 'HH24:MI') as event_time,
       recurrence_type,
       weekly_day,
       null::text as category
     from public.church_events
     where is_active = true`,
  );

  const items: NextWeekScheduleItem[] = [];
  for (const rawRow of eventsRes.rows) {
    const row = rawRow as DbRecord;
    const id = Number(row.id);
    if (!Number.isFinite(id)) continue;
    const title = String(row.title ?? '').trim();
    if (!title) continue;
    const recurrence = String(row.recurrence_type ?? 'once').toLowerCase() === 'weekly' ? 'weekly' : 'once';
    const eventTime = normalizeTimeHm(row.event_time);
    const description = row.description == null ? null : String(row.description);
    const category = row.category == null ? null : String(row.category);

    if (recurrence === 'weekly') {
      const wdRaw = row.weekly_day;
      let weekDay = Number.isInteger(Number(wdRaw)) ? Number(wdRaw) : NaN;
      if (!Number.isFinite(weekDay)) {
        const eventDate = String(row.event_date ?? '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
          const dt = new Date(`${eventDate}T12:00:00`);
          if (!Number.isNaN(dt.getTime())) weekDay = dt.getDay();
        }
      }
      if (!Number.isFinite(weekDay)) continue;
      const offset = weekDay === 0 ? 6 : weekDay - 1;
      const occurDate = formatYmdLocal(addDays(weekStart, offset));
      items.push({
        id,
        title,
        event_date: occurDate,
        event_time: eventTime,
        description,
        category,
      });
      continue;
    }

    const eventDate = String(row.event_date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) continue;
    if (eventDate < weekStartYmd || eventDate > weekEndYmd) continue;
    items.push({
      id,
      title,
      event_date: eventDate,
      event_time: eventTime,
      description,
      category,
    });
  }

  items.sort((a, b) => {
    const byDate = a.event_date.localeCompare(b.event_date);
    if (byDate !== 0) return byDate;
    const byTime = a.event_time.localeCompare(b.event_time);
    if (byTime !== 0) return byTime;
    return a.title.localeCompare(b.title, 'ru');
  });

  return {
    week_start: weekStartYmd,
    week_end: weekEndYmd,
    items,
  };
}

function withNextWeekSchedule(
  content: Record<string, unknown>,
  payload: NextWeekSchedulePayload,
): Record<string, unknown> {
  return {
    ...content,
    schedule_week_start: payload.week_start,
    schedule_week_end: payload.week_end,
    schedule_events: payload.items,
  };
}

function mapPlanRow(row: DbRecord): PlannerPlanListItem {
  return {
    id: Number(row.id),
    template_id: row.template_id == null ? null : Number(row.template_id),
    service_date: String(row.service_date ?? ''),
    start_time: toTimeHm(row.start_time),
    status: row.status === 'published' ? 'published' : 'draft',
    is_archived: Boolean(row.is_archived),
    leader_member_id: row.leader_member_id == null ? null : Number(row.leader_member_id),
    preacher_member_id: row.preacher_member_id == null ? null : Number(row.preacher_member_id),
    total_duration_minutes: Number(row.total_duration_minutes ?? 0),
    current_block_id: row.current_block_id == null ? null : Number(row.current_block_id),
    share_token: String(row.share_token ?? ''),
    edit_token: String(row.edit_token ?? ''),
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

export async function listPlans(input: {
  from?: string;
  to?: string;
  include_archived?: boolean;
}): Promise<PlannerPlanListItem[]> {
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
  if (!input.include_archived) {
    where.push(`p.is_archived = false`);
  }
  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const { rows } = await query(
    `select
       p.id, p.template_id, p.service_date::text as service_date, p.start_time, p.status, p.is_archived,
       p.leader_member_id, p.preacher_member_id, p.total_duration_minutes, p.current_block_id,
       p.share_token::text as share_token, p.edit_token::text as edit_token,
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
       p.id, p.template_id, p.service_date::text as service_date, p.start_time, p.status, p.is_archived,
       p.leader_member_id, p.preacher_member_id, p.total_duration_minutes, p.current_block_id,
       p.share_token::text as share_token, p.edit_token::text as edit_token,
       p.notes, p.created_at::text as created_at, p.updated_at::text as updated_at,
       p.last_edited_by_member_id,
       p.last_edited_at::text as last_edited_at,
       coalesce(
         nullif(trim(concat(coalesce(ed.first_name, ''), ' ', coalesce(ed.last_name, ''))), ''),
         ed.name
       ) as last_edited_by_name,
       t.name as template_name,
       (select count(*) from public.service_blocks b where b.service_plan_id = p.id) as blocks_count
     from public.service_plans p
     left join public.service_templates t on t.id = p.template_id
     left join public.members ed on ed.id = p.last_edited_by_member_id
     where p.id = $1
     limit 1`,
    [planId],
  );
  const row = planRes.rows[0] as DbRecord | undefined;
  if (!row) return null;

  const blocksRes = await query(
    `select
       b.id,
       b.service_plan_id,
       b.block_type_id,
       b.title,
       b.order_index,
       b.duration_minutes,
       b.assigned_member_id,
       b.song_id,
       b.content_json,
       bt.code as block_type_code
     from public.service_blocks b
     left join public.block_types bt on bt.id = b.block_type_id
     where service_plan_id = $1
     order by b.order_index asc, b.id asc`,
    [planId],
  );

  const base = mapPlanRow(row);
  const hasBirthdayBlocks = blocksRes.rows.some(
    (r) => String((r as DbRecord).block_type_code ?? '').toLowerCase() === 'birthdays',
  );
  const birthdayPayload = hasBirthdayBlocks ? await getWeekBirthdays(base.service_date) : null;
  const hasScheduleBlocks = blocksRes.rows.some((r) => isWeeklyScheduleBlock(r as DbRecord));
  const schedulePayload = hasScheduleBlocks ? await getNextWeekSchedule(base.service_date) : null;
  return {
    ...base,
    notes: row.notes == null ? null : String(row.notes),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
    last_edited_by_member_id:
      row.last_edited_by_member_id == null ? null : Number(row.last_edited_by_member_id),
    last_edited_at: row.last_edited_at == null ? null : String(row.last_edited_at),
    last_edited_by_name:
      row.last_edited_by_name == null || String(row.last_edited_by_name).trim() === ''
        ? null
        : String(row.last_edited_by_name).trim(),
    blocks: blocksRes.rows.map((r) => {
      const record = r as DbRecord;
      const mapped = mapBlockRow(record);
      const isBirthdays = String(record.block_type_code ?? '').toLowerCase() === 'birthdays';
      const isSchedule = isWeeklyScheduleBlock(record);
      if (!isBirthdays && !isSchedule) return mapped;
      let content = mapped.content_json;
      if (isBirthdays && birthdayPayload) {
        content = withBirthdayWeek(content, birthdayPayload);
      }
      if (isSchedule && schedulePayload) {
        content = withNextWeekSchedule(content, schedulePayload);
      }
      return {
        ...mapped,
        content_json: content,
      };
    }),
  };
}

export async function getServicePlanIdForBlock(blockId: number): Promise<number | null> {
  await ensurePlannerSchema();
  const res = await query(
    `select service_plan_id from public.service_blocks where id = $1 limit 1`,
    [blockId],
  );
  const raw = res.rows[0] as { service_plan_id?: unknown } | undefined;
  if (!raw || raw.service_plan_id == null) return null;
  const n = Number(raw.service_plan_id);
  return Number.isFinite(n) ? n : null;
}

export async function markServicePlanLastEdited(planId: number, editorMemberId: number): Promise<void> {
  await ensurePlannerSchema();
  await query(
    `update public.service_plans
     set last_edited_by_member_id = $2,
         last_edited_at = now(),
         updated_at = now()
     where id = $1`,
    [planId, editorMemberId],
  );
}

/**
 * Участник может присоединиться к комнате присутствия плана (тот же круг, что и правка через API:
 * лидер/проповедник плана либо admin/editor/minister).
 */
export async function memberCanJoinServicePlanPresenceSession(
  planId: number,
  memberId: number,
): Promise<boolean> {
  await ensurePlannerSchema();
  const res = await query(
    `select 1
     from public.service_plans p
     where p.id = $1
       and (
         p.leader_member_id = $2
         or p.preacher_member_id = $2
         or exists (
           select 1
           from public.members m
           where m.id = $2
             and (
               m.app_role in ('admin', 'editor', 'minister')
               or coalesce(m.app_roles, array[]::text[]) && array['admin','editor','minister']::text[]
             )
         )
       )
     limit 1`,
    [planId, memberId],
  );
  return res.rows.length > 0;
}

export async function getPublicPlanByToken(token: string): Promise<PublicPlannerPlanPayload | null> {
  await ensurePlannerSchema();
  const normalizedToken = String(token ?? '').trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(normalizedToken)) return null;

  const planRes = await query(
    `select
       p.id,
       p.service_date::text as service_date,
       p.start_time,
       p.status,
       p.total_duration_minutes,
       p.notes,
       p.share_token::text as share_token,
       t.name as template_name,
       coalesce(nullif(trim(concat(coalesce(leader.first_name, ''), ' ', coalesce(leader.last_name, ''))), ''), leader.name) as leader_name,
       coalesce(nullif(trim(concat(coalesce(preacher.first_name, ''), ' ', coalesce(preacher.last_name, ''))), ''), preacher.name) as preacher_name
     from public.service_plans p
     left join public.service_templates t on t.id = p.template_id
     left join public.members leader on leader.id = p.leader_member_id
     left join public.members preacher on preacher.id = p.preacher_member_id
     where p.share_token = $1::uuid
       and p.share_token_issued_at >= now() - ($2::int * interval '1 day')
     limit 1`,
    [normalizedToken, SHARE_TOKEN_MAX_AGE_DAYS],
  );
  const row = planRes.rows[0] as DbRecord | undefined;
  if (!row) return null;

  const blocksRes = await query(
    `select
       b.id,
       b.block_type_id,
       b.order_index,
       b.title,
       b.duration_minutes,
       b.assigned_member_id,
       b.song_id,
       bt.name as block_type_name,
       bt.code as block_type_code,
       coalesce(nullif(trim(concat(coalesce(m.first_name, ''), ' ', coalesce(m.last_name, ''))), ''), m.name) as assigned_member_name,
       s.title as song_title,
       s.default_key as song_key,
       b.content_json
     from public.service_blocks b
     left join public.block_types bt on bt.id = b.block_type_id
     left join public.members m on m.id = b.assigned_member_id
     left join public.songs s on s.id = b.song_id
     where b.service_plan_id = $1
     order by b.order_index asc, b.id asc`,
    [Number(row.id)],
  );

  const serviceDate = String(row.service_date ?? '');
  const hasBirthdayBlocks = blocksRes.rows.some(
    (r) => String((r as DbRecord).block_type_code ?? '').toLowerCase() === 'birthdays',
  );
  const birthdayPayload = hasBirthdayBlocks ? await getWeekBirthdays(serviceDate) : null;
  const hasScheduleBlocks = blocksRes.rows.some((r) => isWeeklyScheduleBlock(r as DbRecord));
  const schedulePayload = hasScheduleBlocks ? await getNextWeekSchedule(serviceDate) : null;

  return {
    plan: {
      id: Number(row.id),
      service_date: serviceDate,
      start_time: toTimeHm(row.start_time),
      status: row.status === 'published' ? 'published' : 'draft',
      total_duration_minutes: Number(row.total_duration_minutes ?? 0),
      notes: row.notes == null ? null : String(row.notes),
      share_token: String(row.share_token ?? ''),
      template_name: row.template_name == null ? null : String(row.template_name),
      leader_name: row.leader_name == null ? null : String(row.leader_name),
      preacher_name: row.preacher_name == null ? null : String(row.preacher_name),
    },
    blocks: blocksRes.rows.map((r) => {
      const x = r as DbRecord;
      return {
        id: Number(x.id),
        block_type_id: Number(x.block_type_id),
        order_index: Number(x.order_index ?? 0),
        title: String(x.title ?? ''),
        duration_minutes: Number(x.duration_minutes ?? 0),
        assigned_member_id: x.assigned_member_id == null ? null : Number(x.assigned_member_id),
        song_id: x.song_id == null ? null : Number(x.song_id),
        block_type_name: x.block_type_name == null ? null : String(x.block_type_name),
        block_type_code: x.block_type_code == null ? null : String(x.block_type_code),
        assigned_member_name: x.assigned_member_name == null ? null : String(x.assigned_member_name),
        song_title: x.song_title == null ? null : String(x.song_title),
        song_key: x.song_key == null ? null : String(x.song_key),
        content_json: (() => {
          let content = asObject(x.content_json);
          const isBirthdays = String(x.block_type_code ?? '').toLowerCase() === 'birthdays';
          const isSchedule = isWeeklyScheduleBlock(x);
          if (isBirthdays && birthdayPayload) {
            content = withBirthdayWeek(content, birthdayPayload);
          }
          if (isSchedule && schedulePayload) {
            content = withNextWeekSchedule(content, schedulePayload);
          }
          return content;
        })(),
      };
    }),
  };
}

export async function getEditablePlanByToken(token: string): Promise<PublicEditablePlannerPlanPayload | null> {
  await ensurePlannerSchema();
  const normalizedToken = String(token ?? '').trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(normalizedToken)) return null;

  const planRes = await query(
    `select
       p.id,
       p.service_date::text as service_date,
       p.start_time,
       p.status,
       p.total_duration_minutes,
       p.notes,
       p.edit_token::text as edit_token,
       p.preacher_member_id,
       t.name as template_name,
       coalesce(nullif(trim(concat(coalesce(leader.first_name, ''), ' ', coalesce(leader.last_name, ''))), ''), leader.name) as leader_name,
       coalesce(nullif(trim(concat(coalesce(preacher.first_name, ''), ' ', coalesce(preacher.last_name, ''))), ''), preacher.name) as preacher_name
     from public.service_plans p
     left join public.service_templates t on t.id = p.template_id
     left join public.members leader on leader.id = p.leader_member_id
     left join public.members preacher on preacher.id = p.preacher_member_id
     where p.edit_token = $1::uuid
       and p.status = 'draft'
       and p.edit_token_issued_at >= now() - ($2::int * interval '1 day')
     limit 1`,
    [normalizedToken, EDIT_TOKEN_MAX_AGE_DAYS],
  );
  const row = planRes.rows[0] as DbRecord | undefined;
  if (!row) return null;

  const blocksRes = await query(
    `select
       b.id,
       b.block_type_id,
       b.order_index,
       b.title,
       b.duration_minutes,
       b.assigned_member_id,
       b.song_id,
       bt.name as block_type_name,
       bt.code as block_type_code,
       coalesce(nullif(trim(concat(coalesce(m.first_name, ''), ' ', coalesce(m.last_name, ''))), ''), m.name) as assigned_member_name,
       s.title as song_title,
       s.default_key as song_key,
       b.content_json
     from public.service_blocks b
     left join public.block_types bt on bt.id = b.block_type_id
     left join public.members m on m.id = b.assigned_member_id
     left join public.songs s on s.id = b.song_id
     where b.service_plan_id = $1
     order by b.order_index asc, b.id asc`,
    [Number(row.id)],
  );

  const serviceDate = String(row.service_date ?? '');
  const hasBirthdayBlocks = blocksRes.rows.some(
    (r) => String((r as DbRecord).block_type_code ?? '').toLowerCase() === 'birthdays',
  );
  const birthdayPayload = hasBirthdayBlocks ? await getWeekBirthdays(serviceDate) : null;
  const hasScheduleBlocks = blocksRes.rows.some((r) => isWeeklyScheduleBlock(r as DbRecord));
  const schedulePayload = hasScheduleBlocks ? await getNextWeekSchedule(serviceDate) : null;

  return {
    plan: {
      id: Number(row.id),
      service_date: String(row.service_date ?? ''),
      start_time: toTimeHm(row.start_time),
      status: row.status === 'published' ? 'published' : 'draft',
      total_duration_minutes: Number(row.total_duration_minutes ?? 0),
      notes: row.notes == null ? null : String(row.notes),
      edit_token: String(row.edit_token ?? ''),
      template_name: row.template_name == null ? null : String(row.template_name),
      leader_name: row.leader_name == null ? null : String(row.leader_name),
      preacher_member_id: row.preacher_member_id == null ? null : Number(row.preacher_member_id),
      preacher_name: row.preacher_name == null ? null : String(row.preacher_name),
    },
    blocks: blocksRes.rows.map((r) => {
      const x = r as DbRecord;
      return {
        id: Number(x.id),
        block_type_id: Number(x.block_type_id),
        order_index: Number(x.order_index ?? 0),
        title: String(x.title ?? ''),
        duration_minutes: Number(x.duration_minutes ?? 0),
        assigned_member_id: x.assigned_member_id == null ? null : Number(x.assigned_member_id),
        song_id: x.song_id == null ? null : Number(x.song_id),
        block_type_name: x.block_type_name == null ? null : String(x.block_type_name),
        block_type_code: x.block_type_code == null ? null : String(x.block_type_code),
        assigned_member_name: x.assigned_member_name == null ? null : String(x.assigned_member_name),
        song_title: x.song_title == null ? null : String(x.song_title),
        song_key: x.song_key == null ? null : String(x.song_key),
        content_json: (() => {
          let content = asObject(x.content_json);
          const isBirthdays = String(x.block_type_code ?? '').toLowerCase() === 'birthdays';
          const isSchedule = isWeeklyScheduleBlock(x);
          if (isBirthdays && birthdayPayload) {
            content = withBirthdayWeek(content, birthdayPayload);
          }
          if (isSchedule && schedulePayload) {
            content = withNextWeekSchedule(content, schedulePayload);
          }
          return content;
        })(),
      };
    }),
  };
}

export async function getEditablePlanMetaByToken(
  token: string,
): Promise<PublicEditablePlannerPlanMetaPayload | null> {
  await ensurePlannerSchema();
  const normalizedToken = String(token ?? '').trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(normalizedToken)) return null;

  const canEditRes = await query(
    `select id
     from public.service_plans
     where edit_token = $1::uuid
       and status = 'draft'
       and edit_token_issued_at >= now() - ($2::int * interval '1 day')
     limit 1`,
    [normalizedToken, EDIT_TOKEN_MAX_AGE_DAYS],
  );
  if ((canEditRes.rowCount ?? 0) === 0) return null;

  const [blockTypesRes, membersRes, songsRes] = await Promise.all([
    query(
      `select id, code, name, kind
       from public.block_types
       order by id asc`,
    ),
    query(
      `select
         id,
         first_name,
         last_name,
         coalesce(name, '') as name,
         ministry_role,
         ministry_direction,
         app_role
       from public.members
       where coalesce(is_active, true) = true
       order by coalesce(first_name, ''), coalesce(last_name, ''), coalesce(name, '')`,
    ),
    query(
      `select id, title, default_key
       from public.songs
       order by title asc`,
    ),
  ]);

  return {
    block_types: blockTypesRes.rows.map((r) => {
      const x = r as DbRecord;
      return {
        id: Number(x.id),
        code: String(x.code ?? ''),
        name: String(x.name ?? ''),
        kind: (x.kind as PlannerBlockType['kind']) || 'custom',
      };
    }),
    members: membersRes.rows.map((r) => {
      const x = r as DbRecord;
      return {
        id: Number(x.id),
        first_name: x.first_name == null ? null : String(x.first_name),
        last_name: x.last_name == null ? null : String(x.last_name),
        name: String(x.name ?? ''),
        ministry_role: x.ministry_role == null ? null : String(x.ministry_role),
        ministry_direction: x.ministry_direction == null ? null : String(x.ministry_direction),
        app_role: String(x.app_role ?? 'member'),
      };
    }),
    songs: songsRes.rows.map((r) => {
      const x = r as DbRecord;
      return {
        id: Number(x.id),
        title: String(x.title ?? ''),
        default_key: x.default_key == null ? null : String(x.default_key),
      };
    }),
  };
}

export async function patchEditableBlockByToken(
  token: string,
  blockId: number,
  patch: Partial<{
    title: string;
    duration_minutes: number;
    block_type_id: number;
    assigned_member_id: number | null;
    song_id: number | null;
    content_json: Record<string, unknown>;
  }>,
): Promise<boolean> {
  await ensurePlannerSchema();
  const normalizedToken = String(token ?? '').trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(normalizedToken)) return false;
  if (!Number.isInteger(blockId) || blockId <= 0) return false;

  const set: string[] = [];
  const values: unknown[] = [];
  const push = (sql: string, value: unknown) => {
    values.push(value);
    set.push(sql.replace('?', `$${values.length}`));
  };

  if (patch.title !== undefined) push('title = ?', patch.title);
  if (patch.duration_minutes !== undefined) push('duration_minutes = ?', patch.duration_minutes);
  if (patch.block_type_id !== undefined) push('block_type_id = ?', patch.block_type_id);
  if (patch.assigned_member_id !== undefined) push('assigned_member_id = ?', patch.assigned_member_id);
  if (patch.song_id !== undefined) push('song_id = ?', patch.song_id);
  if (patch.content_json !== undefined) {
    values.push(JSON.stringify(patch.content_json ?? {}));
    set.push(`content_json = $${values.length}::jsonb`);
  }
  if (set.length === 0) return true;

  values.push(blockId);
  values.push(normalizedToken);
  const result = await query(
    `update public.service_blocks b
     set ${set.join(', ')}
     from public.service_plans p
     where b.id = $${values.length - 1}
       and p.edit_token = $${values.length}::uuid
       and p.status = 'draft'
       and p.edit_token_issued_at >= now() - ($${values.length + 1}::int * interval '1 day')
       and p.id = b.service_plan_id
     returning b.service_plan_id`,
    [...values, EDIT_TOKEN_MAX_AGE_DAYS],
  );
  if ((result.rowCount ?? 0) === 0) return false;
  const updatedPlanId = Number((result.rows[0] as DbRecord).service_plan_id);
  if (Number.isFinite(updatedPlanId)) {
    await query(
      `update public.service_plans
       set last_edited_by_member_id = null,
           last_edited_at = now(),
           updated_at = now()
       where id = $1`,
      [updatedPlanId],
    );
  }
  return true;
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

export async function deleteTemplate(templateId: number): Promise<boolean> {
  await ensurePlannerSchema();
  const res = await query(`delete from public.service_templates where id = $1`, [templateId]);
  return (res.rowCount ?? 0) > 0;
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
            leader_member_id = excluded.leader_member_id,
            preacher_member_id = excluded.preacher_member_id,
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
           case
             when coalesce(tb.default_content_json->>'default_assigned_member_id', '') ~ '^\d+$'
               then (tb.default_content_json->>'default_assigned_member_id')::integer
             else null
           end,
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
    is_archived: boolean;
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
  if (patch.is_archived !== undefined) push('is_archived = ?', patch.is_archived);
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

export async function deletePlan(planId: number): Promise<boolean> {
  await ensurePlannerSchema();
  const res = await query(`delete from public.service_plans where id = $1`, [planId]);
  return (res.rowCount ?? 0) > 0;
}

export async function reorderBlocks(servicePlanId: number, orderedBlockIds: number[]): Promise<void> {
  await ensurePlannerSchema();
  if (!pool) throw new Error('Database pool not configured');
  const client = await pool.connect();
  try {
    await client.query('begin');

    const existingRes = await client.query(
      `select id from public.service_blocks where service_plan_id = $1 order by order_index asc for update`,
      [servicePlanId],
    );
    const existingIds = existingRes.rows.map((r) => Number((r as DbRecord).id)).sort((a, b) => a - b);
    const incoming = [...orderedBlockIds].sort((a, b) => a - b);
    if (existingIds.length !== incoming.length || existingIds.some((id, idx) => id !== incoming[idx])) {
      throw new Error('Ordered block ids do not match service plan blocks');
    }

    // Two-phase reorder to avoid transient unique collisions on
    // (service_plan_id, order_index) while rows are being updated.
    await client.query(
      `update public.service_blocks
       set order_index = order_index + 100000
       where service_plan_id = $1`,
      [servicePlanId],
    );

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

export async function createBlock(input: {
  service_plan_id: number;
  block_type_id: number;
  title: string;
  duration_minutes: number;
  assigned_member_id: number | null;
  song_id: number | null;
  content_json: Record<string, unknown>;
}): Promise<number> {
  await ensurePlannerSchema();
  const posRes = await query(
    `select coalesce(max(order_index), -1) + 1 as next_pos
     from public.service_blocks
     where service_plan_id = $1`,
    [input.service_plan_id],
  );
  const nextPos = Number((posRes.rows[0] as DbRecord | undefined)?.next_pos ?? 0);
  const ins = await query(
    `insert into public.service_blocks
     (service_plan_id, block_type_id, title, order_index, duration_minutes, assigned_member_id, song_id, content_json)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     returning id`,
    [
      input.service_plan_id,
      input.block_type_id,
      input.title,
      nextPos,
      input.duration_minutes,
      input.assigned_member_id,
      input.song_id,
      JSON.stringify(input.content_json ?? {}),
    ],
  );
  return Number((ins.rows[0] as DbRecord).id);
}

export async function deleteBlock(blockId: number): Promise<boolean> {
  await ensurePlannerSchema();
  if (!pool) throw new Error('Database pool not configured');
  const client = await pool.connect();
  try {
    await client.query('begin');
    const row = await client.query(
      `select id, service_plan_id from public.service_blocks where id = $1 limit 1`,
      [blockId],
    );
    const found = row.rows[0] as DbRecord | undefined;
    if (!found) {
      await client.query('rollback');
      return false;
    }
    const planId = Number(found.service_plan_id);
    await client.query(`delete from public.service_blocks where id = $1`, [blockId]);
    const rest = await client.query(
      `select id from public.service_blocks where service_plan_id = $1 order by order_index asc, id asc`,
      [planId],
    );
    for (let i = 0; i < rest.rows.length; i += 1) {
      await client.query(`update public.service_blocks set order_index = $1 where id = $2`, [
        i,
        Number((rest.rows[i] as DbRecord).id),
      ]);
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
