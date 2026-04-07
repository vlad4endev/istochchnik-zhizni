-- Стабильный публичный UUID пользователя (внешний user_id), отдельно от числового id.
alter table public.members add column if not exists user_id uuid;

update public.members
set user_id = gen_random_uuid()
where user_id is null;

alter table public.members alter column user_id set default gen_random_uuid();
alter table public.members alter column user_id set not null;

create unique index if not exists members_user_id_uidx on public.members (user_id);
