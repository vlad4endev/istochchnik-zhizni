-- Service planner: add schedule/title fields required by UI and API.

alter table if exists public.service_templates
  add column if not exists default_start_time time not null default '10:00';

alter table if exists public.service_plans
  add column if not exists start_time time not null default '10:00';

alter table if exists public.service_template_blocks
  add column if not exists title varchar(255) not null default '';

alter table if exists public.service_blocks
  add column if not exists title varchar(255) not null default '';
