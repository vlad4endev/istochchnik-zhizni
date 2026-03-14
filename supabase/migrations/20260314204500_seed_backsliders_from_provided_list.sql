-- Seed backsliders (global needs section) from provided list.
-- Idempotent by name to avoid duplicates.

with source_backsliders(full_name) as (
  values
    ('Антонов Сергей'),
    ('Воронков Виталий'),
    ('Воронкова Галина'),
    ('Ермаков Дмитрий'),
    ('Ефремова Елена'),
    ('Козубович Ангелина'),
    ('Корчагина Анастасия'),
    ('Латышев Александр'),
    ('Мурлык Евгений'),
    ('Наташа Лакомкина'),
    ('Панова Татьяна'),
    ('Подюков Александр'),
    ('Подюкова Екатерина'),
    ('Сергей Лакомкин'),
    ('Татаринцева Елена'),
    ('Ткачев Андрей'),
    ('Ткачева Надежда'),
    ('Черкасова Ирина'),
    ('Боброва Александра')
)
insert into public.backsliders (name)
select s.full_name
from source_backsliders s
where not exists (
  select 1
  from public.backsliders b
  where lower(trim(b.name)) = lower(trim(s.full_name))
);
