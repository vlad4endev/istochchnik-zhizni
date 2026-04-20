-- Планировщик служений: шаблоны, экземпляры планов, блоки, справочник типов блоков.
-- Связи: members (ведущий/проповедник/исполнитель), songs, опционально church_events.

-- Справочник типов блоков
create table if not exists public.block_types (
  id smallserial primary key,
  code varchar(64) not null unique,
  name varchar(120) not null,
  kind varchar(32) not null
    check (kind in ('song', 'text', 'speaker', 'custom')),
  icon varchar(64),
  default_duration_minutes smallint not null default 5
    check (default_duration_minutes > 0),
  created_at timestamptz not null default now()
);

insert into public.block_types (code, name, kind, icon, default_duration_minutes)
values
  ('prayer', 'Молитва', 'text', 'hands-praying', 5),
  ('song', 'Песня', 'song', 'music', 6),
  ('scripture', 'Чтение Писания', 'text', 'book-bible', 5),
  ('sermon', 'Проповедь', 'speaker', 'person-chalkboard', 35),
  ('announcements', 'Объявления', 'text', 'bullhorn', 5),
  ('offering', 'Сбор пожертвований', 'custom', 'hand-holding-dollar', 3),
  ('custom', 'Произвольный блок', 'custom', 'puzzle-piece', 5)
on conflict (code) do nothing;

-- Шаблон служения + правило повторения (JSON)
create table if not exists public.service_templates (
  id bigserial primary key,
  name varchar(255) not null,
  description text,
  recurrence_rule jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by_member_id integer references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_templates_active
  on public.service_templates (is_active);

-- Структура шаблона (копируется в service_blocks при генерации плана)
create table if not exists public.service_template_blocks (
  id bigserial primary key,
  template_id bigint not null references public.service_templates (id) on delete cascade,
  block_type_id smallint not null references public.block_types (id) on delete restrict,
  order_index integer not null check (order_index >= 0),
  duration_minutes smallint not null default 5 check (duration_minutes > 0),
  default_song_id bigint references public.songs (id) on delete set null,
  default_content_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (template_id, order_index)
);

create index if not exists idx_service_template_blocks_template
  on public.service_template_blocks (template_id, order_index);

-- Экземпляр служения (без FK на current_block_id до создания service_blocks)
create table if not exists public.service_plans (
  id bigserial primary key,
  template_id bigint references public.service_templates (id) on delete set null,
  service_date date not null,
  status varchar(20) not null default 'draft'
    check (status in ('draft', 'published')),
  leader_member_id integer references public.members (id) on delete set null,
  preacher_member_id integer references public.members (id) on delete set null,
  total_duration_minutes integer not null default 0 check (total_duration_minutes >= 0),
  share_token uuid not null default gen_random_uuid() unique,
  church_event_id bigint references public.church_events (id) on delete set null,
  notes text,
  created_by_member_id integer references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, service_date)
);

create index if not exists idx_service_plans_date on public.service_plans (service_date desc);
create index if not exists idx_service_plans_leader on public.service_plans (leader_member_id);
create index if not exists idx_service_plans_status on public.service_plans (status);

-- Блоки конкретного плана
create table if not exists public.service_blocks (
  id bigserial primary key,
  service_plan_id bigint not null references public.service_plans (id) on delete cascade,
  block_type_id smallint not null references public.block_types (id) on delete restrict,
  order_index integer not null check (order_index >= 0),
  duration_minutes smallint not null default 5 check (duration_minutes > 0),
  assigned_member_id integer references public.members (id) on delete set null,
  song_id bigint references public.songs (id) on delete set null,
  content_json jsonb not null default '{}'::jsonb,
  source_template_block_id bigint references public.service_template_blocks (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (service_plan_id, order_index)
);

create index if not exists idx_service_blocks_plan on public.service_blocks (service_plan_id, order_index);

-- Текущий блок (режим «во время служения»); FK после service_blocks
alter table public.service_plans add column if not exists current_block_id bigint;

alter table public.service_plans
  drop constraint if exists service_plans_current_block_id_fkey;

alter table public.service_plans
  add constraint service_plans_current_block_id_fkey
  foreign key (current_block_id) references public.service_blocks (id) on delete set null;

-- Пересчёт суммарной длительности плана по блокам
create or replace function public.service_plans_recalc_duration()
returns trigger
language plpgsql
as $$
declare
  pid bigint;
begin
  pid := coalesce(new.service_plan_id, old.service_plan_id);
  if pid is null then
    return coalesce(new, old);
  end if;
  update public.service_plans p
  set
    total_duration_minutes = coalesce((
      select sum(b.duration_minutes)::integer from public.service_blocks b where b.service_plan_id = pid
    ), 0),
    updated_at = now()
  where p.id = pid;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_service_blocks_recalc_ins on public.service_blocks;
drop trigger if exists trg_service_blocks_recalc_upd on public.service_blocks;
drop trigger if exists trg_service_blocks_recalc_del on public.service_blocks;

create trigger trg_service_blocks_recalc_ins
  after insert on public.service_blocks
  for each row execute procedure public.service_plans_recalc_duration();

create trigger trg_service_blocks_recalc_upd
  after update of duration_minutes, service_plan_id on public.service_blocks
  for each row execute procedure public.service_plans_recalc_duration();

create trigger trg_service_blocks_recalc_del
  after delete on public.service_blocks
  for each row execute procedure public.service_plans_recalc_duration();

-- RLS (предполагается связка Supabase Auth: auth.uid() = members.user_id)
alter table public.block_types enable row level security;
alter table public.service_templates enable row level security;
alter table public.service_template_blocks enable row level security;
alter table public.service_plans enable row level security;
alter table public.service_blocks enable row level security;

create or replace function public.current_member_id()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select m.id from public.members m where m.user_id = auth.uid() limit 1;
$$;

revoke all on function public.current_member_id() from public;
grant execute on function public.current_member_id() to authenticated;
grant execute on function public.current_member_id() to service_role;

-- block_types: чтение всем аутентифицированным
drop policy if exists block_types_select_authenticated on public.block_types;
create policy block_types_select_authenticated on public.block_types
  for select to authenticated using (true);

-- Шаблоны: чтение аутентифицированным; запись — admin/editor
drop policy if exists service_templates_select_authenticated on public.service_templates;
create policy service_templates_select_authenticated on public.service_templates
  for select to authenticated using (true);

drop policy if exists service_templates_write_privileged on public.service_templates;
create policy service_templates_write_privileged on public.service_templates
  for all to authenticated
  using (
    exists (
      select 1 from public.members m
      where m.id = public.current_member_id()
        and m.app_role in ('admin', 'editor')
    )
  )
  with check (
    exists (
      select 1 from public.members m
      where m.id = public.current_member_id()
        and m.app_role in ('admin', 'editor')
    )
  );

drop policy if exists service_template_blocks_select_authenticated on public.service_template_blocks;
create policy service_template_blocks_select_authenticated on public.service_template_blocks
  for select to authenticated using (true);

drop policy if exists service_template_blocks_write_privileged on public.service_template_blocks;
create policy service_template_blocks_write_privileged on public.service_template_blocks
  for all to authenticated
  using (
    exists (
      select 1 from public.members m
      where m.id = public.current_member_id()
        and m.app_role in ('admin', 'editor')
    )
  )
  with check (
    exists (
      select 1 from public.members m
      where m.id = public.current_member_id()
        and m.app_role in ('admin', 'editor')
    )
  );

-- Планы: чтение — опубликованные всем; черновики — лидер / admin / editor
drop policy if exists service_plans_select on public.service_plans;
create policy service_plans_select on public.service_plans
  for select to authenticated
  using (
    status = 'published'
    or leader_member_id = public.current_member_id()
    or preacher_member_id = public.current_member_id()
    or exists (
      select 1 from public.members m
      where m.id = public.current_member_id()
        and m.app_role in ('admin', 'editor')
    )
  );

drop policy if exists service_plans_insert on public.service_plans;
create policy service_plans_insert on public.service_plans
  for insert to authenticated
  with check (
    leader_member_id = public.current_member_id()
    or exists (
      select 1 from public.members m
      where m.id = public.current_member_id()
        and m.app_role in ('admin', 'editor')
    )
  );

drop policy if exists service_plans_update_leader on public.service_plans;
create policy service_plans_update_leader on public.service_plans
  for update to authenticated
  using (
    leader_member_id = public.current_member_id()
    or preacher_member_id = public.current_member_id()
    or exists (
      select 1 from public.members m
      where m.id = public.current_member_id()
        and m.app_role in ('admin', 'editor')
    )
  )
  with check (
    leader_member_id = public.current_member_id()
    or preacher_member_id = public.current_member_id()
    or exists (
      select 1 from public.members m
      where m.id = public.current_member_id()
        and m.app_role in ('admin', 'editor')
    )
  );

-- Блоки: редактирование, если пользователь может менять родительский план
drop policy if exists service_blocks_select on public.service_blocks;
create policy service_blocks_select on public.service_blocks
  for select to authenticated
  using (
    exists (
      select 1 from public.service_plans p
      where p.id = service_plan_id
        and (
          p.status = 'published'
          or p.leader_member_id = public.current_member_id()
          or p.preacher_member_id = public.current_member_id()
          or exists (
            select 1 from public.members m
            where m.id = public.current_member_id()
              and m.app_role in ('admin', 'editor')
          )
        )
    )
  );

drop policy if exists service_blocks_mutate on public.service_blocks;
create policy service_blocks_mutate on public.service_blocks
  for all to authenticated
  using (
    exists (
      select 1 from public.service_plans p
      where p.id = service_plan_id
        and (
          p.leader_member_id = public.current_member_id()
          or p.preacher_member_id = public.current_member_id()
          or exists (
            select 1 from public.members m
            where m.id = public.current_member_id()
              and m.app_role in ('admin', 'editor')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.service_plans p
      where p.id = service_plan_id
        and (
          p.leader_member_id = public.current_member_id()
          or p.preacher_member_id = public.current_member_id()
          or exists (
            select 1 from public.members m
            where m.id = public.current_member_id()
              and m.app_role in ('admin', 'editor')
          )
        )
    )
  );

-- Публичное чтение опубликованного плана по share_token (anon) через RPC ниже — предпочтительнее;
-- здесь опционально не открываем anon на всю таблицу.

comment on table public.service_templates is 'Шаблоны служений и правило повторения (JSON).';
comment on table public.service_plans is 'Конкретное служение по дате; ведущий/проповедник — members.id.';
comment on table public.service_blocks is 'Блоки плана; гибкие поля в content_json.';

-- Read-only публичный просмотр по share_token (anon + authenticated)
create or replace function public.get_public_service_plan(st uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r json;
begin
  select json_build_object(
    'plan', row_to_json(p),
    'blocks', coalesce((
      select json_agg(row_to_json(b) order by b.order_index)
      from public.service_blocks b
      where b.service_plan_id = p.id
    ), '[]'::json)
  )
  into r
  from public.service_plans p
  where p.share_token = st
    and p.status = 'published'
  limit 1;
  return r;
end;
$$;

revoke all on function public.get_public_service_plan(uuid) from public;
grant execute on function public.get_public_service_plan(uuid) to anon, authenticated;
