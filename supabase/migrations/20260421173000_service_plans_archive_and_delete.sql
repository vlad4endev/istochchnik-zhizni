alter table public.service_plans
  add column if not exists is_archived boolean not null default false;

create index if not exists service_plans_is_archived_service_date_idx
  on public.service_plans (is_archived, service_date desc);
