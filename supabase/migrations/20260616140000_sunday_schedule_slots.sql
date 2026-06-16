-- Pre-assign leader/preacher for Sunday dates before a service plan exists.
create table if not exists public.sunday_schedule_slots (
  service_date date primary key,
  leader_member_id integer references public.members (id) on delete set null,
  preacher_member_id integer references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sunday_schedule_slots_leader
  on public.sunday_schedule_slots (leader_member_id);

create index if not exists idx_sunday_schedule_slots_preacher
  on public.sunday_schedule_slots (preacher_member_id);
