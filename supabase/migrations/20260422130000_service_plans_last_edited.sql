-- Кто и когда последний раз менял программу (план служения)
alter table public.service_plans
  add column if not exists last_edited_by_member_id integer references public.members (id) on delete set null;

alter table public.service_plans
  add column if not exists last_edited_at timestamptz;

comment on column public.service_plans.last_edited_by_member_id is 'Участник, последним сохранивший изменения плана или блоков.';
comment on column public.service_plans.last_edited_at is 'Момент последнего сохранения плана или блоков (ручная метка, не триггер пересчёта длительности).';
