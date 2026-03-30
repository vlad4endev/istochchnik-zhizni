-- Add authentication fields for login/password and user sessions.

alter table public.members
  add column if not exists login varchar(64),
  add column if not exists password_hash text,
  add column if not exists app_role varchar(20) not null default 'member';

create unique index if not exists members_login_unique_idx
  on public.members (lower(login))
  where login is not null;

create table if not exists public.auth_sessions (
  token_hash char(64) primary key,
  member_id integer not null references public.members(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_sessions_member_id_idx
  on public.auth_sessions (member_id);

create index if not exists auth_sessions_expires_at_idx
  on public.auth_sessions (expires_at);
