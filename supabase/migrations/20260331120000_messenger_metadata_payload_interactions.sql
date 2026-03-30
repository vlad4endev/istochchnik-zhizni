-- Messenger: smart folders (metadata), rich message payloads, prayer interactions.
-- Renames conversation type `personal` -> `private` (API routes may still say "personal").

-- ─── conversations: metadata + type rename ─────────────────────
alter table public.conversations
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.conversations
set type = 'private'
where type = 'personal';

alter table public.conversations drop constraint if exists conversations_type_check;
alter table public.conversations
  add constraint conversations_type_check
  check (type in ('private', 'group', 'channel'));

alter table public.conversations
  alter column type set default 'private';

-- ─── message payload + counters ────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'message_payload_type') then
    create type public.message_payload_type as enum ('text', 'prayer_request', 'audio');
  end if;
end $$;

alter table public.messages
  add column if not exists payload_type public.message_payload_type not null default 'text';

alter table public.messages
  add column if not exists payload jsonb not null default '{}'::jsonb;

alter table public.messages
  add column if not exists interaction_count integer not null default 0;

update public.messages m
set payload = jsonb_build_object('text', m.content)
where m.payload_type = 'text'
  and (m.payload is null or m.payload = '{}'::jsonb);

-- Backfill interaction_count from existing interactions (if re-run safe)
-- (none yet on fresh deploy)

-- ─── message_interactions ─────────────────────────────────────
create table if not exists public.message_interactions (
  id bigserial primary key,
  message_id bigint not null references public.messages (id) on delete cascade,
  member_id integer not null references public.members (id) on delete cascade,
  type varchar(32) not null default 'pray_click',
  created_at timestamptz not null default now(),
  constraint message_interactions_message_member_unique unique (message_id, member_id)
);

create index if not exists idx_message_interactions_member
  on public.message_interactions (member_id);

create index if not exists idx_message_interactions_message
  on public.message_interactions (message_id);

-- ─── trigger: treat payload edits like content edits ───────────
create or replace function public.set_messages_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if old.content is distinct from new.content
     or old.payload is distinct from new.payload then
    new.is_edited := true;
  end if;
  return new;
end;
$$;
