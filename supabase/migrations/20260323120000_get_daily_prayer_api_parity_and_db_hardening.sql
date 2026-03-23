-- Align get_daily_prayer with Node API (calendarService): overrides, is_active, member sort.
-- Add supporting indexes and automatic updated_at on access_requests.
--
-- Колонки members (как в src/config/initDb.ts) должны существовать до создания функции ниже.

alter table public.members
  add column if not exists birth_date date,
  add column if not exists first_name varchar(120),
  add column if not exists last_name varchar(120),
  add column if not exists login varchar(64),
  add column if not exists password_hash text,
  add column if not exists phone_number varchar(32),
  add column if not exists ministry_role varchar(120),
  add column if not exists ministry_direction varchar(120),
  add column if not exists email varchar(255),
  add column if not exists account_provider varchar(100),
  add column if not exists account_id varchar(255),
  add column if not exists is_active boolean not null default true,
  add column if not exists app_role varchar(16) not null default 'member',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.members
set app_role = 'member'
where app_role is null or app_role not in ('member', 'admin');

alter table public.members alter column app_role set default 'member';
alter table public.members alter column app_role set not null;

alter table public.members drop constraint if exists members_app_role_check;
alter table public.members
  add constraint members_app_role_check check (app_role in ('member', 'admin'));

create unique index if not exists members_email_unique_idx
  on public.members (lower(email))
  where email is not null;

create unique index if not exists members_login_unique_idx
  on public.members (lower(login))
  where login is not null;

create unique index if not exists members_account_unique_idx
  on public.members (account_provider, account_id)
  where account_provider is not null and account_id is not null;

create index if not exists idx_member_cycle_overrides_member_id
  on public.member_cycle_overrides (member_id);

create or replace function public.get_daily_prayer(target_date date)
returns json
language plpgsql
set search_path = public
as $$
declare
  v_start_date date;
  v_day_diff integer;
  v_total_members integer;
  v_index integer;
  v_member public.members%rowtype;
begin
  insert into public.global_settings (id, start_date)
  values (1, current_date)
  on conflict (id) do nothing;

  select m.*
    into v_member
  from public.member_cycle_overrides o
  join public.members m on m.id = o.member_id
  where o.target_date = target_date
    and m.is_active = true
  limit 1;

  if found then
    return json_build_object('date', target_date, 'member', row_to_json(v_member));
  end if;

  select start_date into v_start_date from public.global_settings where id = 1;

  v_day_diff := target_date - v_start_date;

  select count(*)::integer
    into v_total_members
  from public.members
  where is_active = true;

  if v_total_members = 0 then
    return json_build_object('date', target_date, 'member', null);
  end if;

  v_index := ((v_day_diff % v_total_members) + v_total_members) % v_total_members;

  select m.*
    into v_member
  from public.members m
  where m.is_active = true
  order by
    lower(coalesce(nullif(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1))) asc,
    lower(coalesce(nullif(trim(m.first_name), ''), m.name)) asc,
    m.id asc
  limit 1 offset v_index;

  return json_build_object('date', target_date, 'member', row_to_json(v_member));
end;
$$;

create or replace function public.set_access_requests_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_access_requests_updated_at on public.access_requests;

create trigger trg_access_requests_updated_at
before update on public.access_requests
for each row
execute function public.set_access_requests_updated_at();
