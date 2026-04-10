-- Влад Чендев (+79027330094): админ и координатор сбора; создать строку, если её ещё нет.

begin;

update public.members
set
  first_name = 'Влад',
  last_name = 'Чендев',
  name = 'Чендев Влад',
  phone_number = '+79027330094',
  app_role = 'admin',
  is_collection_coordinator = true,
  is_active = true,
  updated_at = now()
where regexp_replace(coalesce(phone_number, ''), '\D', '', 'g') = '79027330094'
   or lower(trim(coalesce(name, ''))) in (
        lower(trim('Чендев Влад')),
        lower(trim('Влад Чендев'))
      )
   or (
        lower(trim(coalesce(first_name, ''))) = lower(trim('Влад'))
    and lower(trim(coalesce(last_name, ''))) = lower(trim('Чендев'))
   );

insert into public.members (
  first_name,
  last_name,
  name,
  phone_number,
  app_role,
  is_collection_coordinator,
  is_active
)
select
  'Влад',
  'Чендев',
  'Чендев Влад',
  '+79027330094',
  'admin',
  true,
  true
where not exists (
  select 1
  from public.members
  where regexp_replace(coalesce(phone_number, ''), '\D', '', 'g') = '79027330094'
);

commit;
