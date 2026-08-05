-- Dedup for Telegram reminders to preachers ~1.5 weeks before they preach.
create table if not exists public.preacher_sermon_data_reminders (
  id bigserial primary key,
  service_date date not null,
  preacher_member_id integer not null references public.members (id) on delete cascade,
  service_plan_id bigint references public.service_plans (id) on delete set null,
  channel varchar(20) not null default 'telegram',
  notified_at timestamptz not null default now(),
  unique (service_date, preacher_member_id, channel)
);

create index if not exists idx_preacher_sermon_data_reminders_date
  on public.preacher_sermon_data_reminders (service_date);

create index if not exists idx_preacher_sermon_data_reminders_member
  on public.preacher_sermon_data_reminders (preacher_member_id);
