-- Messenger: conversations без default_permissions / settings (старая схема, CREATE TABLE IF NOT EXISTS не дозаполняет колонки).
alter table public.conversations
  add column if not exists default_permissions jsonb not null default jsonb_build_object(
    'can_send_messages', true,
    'can_send_media', true,
    'can_add_users', false,
    'can_pin_messages', false,
    'can_manage_chat', false
  );

alter table public.conversations
  add column if not exists settings jsonb not null default '{}'::jsonb;
