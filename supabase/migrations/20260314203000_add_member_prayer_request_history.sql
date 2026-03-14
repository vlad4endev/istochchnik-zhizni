-- Store history of member prayer request changes.

create table if not exists public.member_prayer_request_history (
  id bigserial primary key,
  member_id integer not null references public.members(id) on delete cascade,
  prayer_request text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_member_prayer_request_history_member_created
  on public.member_prayer_request_history (member_id, created_at desc);
