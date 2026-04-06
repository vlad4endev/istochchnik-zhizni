-- Статус регистрации: полный доступ / ожидание модерации / отказ (ограниченный режим).
alter table public.members
  add column if not exists registration_status varchar(32) not null default 'active';

alter table public.members drop constraint if exists members_registration_status_check;
alter table public.members
  add constraint members_registration_status_check
  check (registration_status in ('active', 'pending_review', 'rejected'));

update public.members
set registration_status = 'active'
where registration_status is null or trim(registration_status) = '';
