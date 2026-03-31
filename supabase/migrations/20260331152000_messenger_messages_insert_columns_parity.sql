-- Messenger parity: columns required by sendMessage INSERT.
-- Protect old DBs where messages was created before dedupe/payload/reply support.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'message_payload_type') then
    create type public.message_payload_type as enum ('text', 'prayer_request', 'audio');
  end if;
end $$;

alter table public.messages
  add column if not exists client_msg_id text;

alter table public.messages
  add column if not exists reply_to_message_id bigint references public.messages (id) on delete set null;

alter table public.messages
  add column if not exists payload_type public.message_payload_type not null default 'text';

alter table public.messages
  add column if not exists payload jsonb not null default '{}'::jsonb;

create unique index if not exists idx_messages_client_dedupe
  on public.messages (conversation_id, sender_id, client_msg_id)
  where client_msg_id is not null;

update public.messages m
set payload = jsonb_build_object('text', m.content)
where m.payload_type = 'text'
  and (m.payload is null or m.payload = '{}'::jsonb);
