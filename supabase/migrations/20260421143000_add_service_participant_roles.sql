-- Ensure ministry roles used in service planning exist.
insert into public.ministry_role_templates (title)
values
  ('Ведущий'),
  ('Проповедник')
on conflict (title) do nothing;

-- Ensure every direction template can use these roles.
insert into public.ministry_direction_role_templates (direction_template_id, role_template_id)
select d.id, r.id
from public.ministry_direction_templates d
join public.ministry_role_templates r
  on r.title in ('Ведущий', 'Проповедник')
on conflict (direction_template_id, role_template_id) do nothing;
