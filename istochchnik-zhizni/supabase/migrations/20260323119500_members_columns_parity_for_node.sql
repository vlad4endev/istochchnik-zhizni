-- Колонки и индексы таблицы members в соответствии с src/config/initDb.ts и Node API.
-- Должна применяться до 20260323120000 (get_daily_prayer использует is_active).

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
