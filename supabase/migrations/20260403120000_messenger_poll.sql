-- Poll messages: enum value + votes table
do $$
begin
  if exists (select 1 from pg_type where typname = 'message_payload_type') then
    begin
      alter type public.message_payload_type add value if not exists 'poll';
    exception when duplicate_object then null;
    end;
  end if;
end $$;

create table if not exists public.message_poll_votes (
  message_id bigint not null references public.messages(id) on delete cascade,
  member_id integer not null references public.members(id) on delete cascade,
  option_index smallint not null check (option_index >= 0),
  created_at timestamptz not null default now(),
  primary key (message_id, member_id, option_index)
);

create index if not exists idx_message_poll_votes_message
  on public.message_poll_votes (message_id);
