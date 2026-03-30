alter table public.members
add column if not exists app_role varchar(16);

update public.members
set app_role = 'member'
where app_role is null or app_role not in ('member', 'admin');

alter table public.members
alter column app_role set default 'member';

alter table public.members
alter column app_role set not null;

alter table public.members
drop constraint if exists members_app_role_check;

alter table public.members
add constraint members_app_role_check
check (app_role in ('member', 'admin'));
