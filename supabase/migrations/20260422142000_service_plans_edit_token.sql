alter table public.service_plans
  add column if not exists edit_token uuid;

update public.service_plans
set edit_token = gen_random_uuid()
where edit_token is null;

alter table public.service_plans
  alter column edit_token set default gen_random_uuid();

alter table public.service_plans
  alter column edit_token set not null;

create unique index if not exists idx_service_plans_edit_token
  on public.service_plans (edit_token);

comment on column public.service_plans.edit_token is 'Секретный токен для упрощенного режима совместного редактирования программы.';
