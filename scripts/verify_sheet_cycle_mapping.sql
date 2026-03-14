-- Verify cycle mapping against sheet order for period:
-- 2026-03-05 .. 2026-06-09
--
-- Run:
--   psql "$DATABASE_URL" -f scripts/verify_sheet_cycle_mapping.sql

create temporary table tmp_expected_members (
  idx integer primary key,
  full_name text not null
) on commit drop;

insert into tmp_expected_members (idx, full_name)
select row_number() over () - 1 as idx, name
from (
  values
    ('Беспалова Татьяна'),
    ('Бизюков Никита'),
    ('Герасимова Алла Ивановна'),
    ('Горбань Андрей'),
    ('Горбань София'),
    ('Грек Борис'),
    ('Грек Вячеслав'),
    ('Грек Тая'),
    ('Грек Ян'),
    ('Гришин Алексей'),
    ('Гришина Ангелина'),
    ('Дудкин Владимир'),
    ('Дудкин Марина'),
    ('Жигунов Александр'),
    ('Жигунов Андрей'),
    ('Жигунов Дмитрий'),
    ('Жигунова Людмила'),
    ('Жигунова Наталья'),
    ('Жупикова Елена'),
    ('Камышин Николай'),
    ('Камышина Светлана'),
    ('Каштанова Татьяна'),
    ('Киселева Нина'),
    ('Корчагин Алексей'),
    ('Корчагина Дарья'),
    ('Корчагина Любовь'),
    ('Латышева Елена'),
    ('Латышева Людмила'),
    ('Малютин Юрий'),
    ('Малютина Елена'),
    ('Малютина Ирина'),
    ('Нестерова Полина'),
    ('Неупокоев Владимир'),
    ('Неупокоева Любовь'),
    ('Плотников Евгений'),
    ('Плотникова Элина'),
    ('Пыльдмаа Екатерина'),
    ('Резяпкина Любовь'),
    ('Cамодуров Михаил'),
    ('Сорокин Дмитрий'),
    ('Сорокина Мария'),
    ('Степанова Светлана'),
    ('Толстошеин Эдуард'),
    ('Толстошеина Ирина'),
    ('Толстошеина Марина'),
    ('Харлашкин Александр'),
    ('Харлашкина Инна'),
    ('Харлашкина Лина'),
    ('Чендев Влад'),
    ('Чендева Наталья'),
    ('Чибисова Нина'),
    ('Шкирская Надежда'),
    ('Шкирский Геннадий'),
    ('Юрьева Надежда')
) as t(name);

create temporary table tmp_compare as
with params as (
  select
    date '2026-03-05' as anchor_date,
    date '2026-06-09' as end_date,
    (select count(*)::int from tmp_expected_members) as total
),
date_series as (
  select g::date as target_date
  from params p
  cross join generate_series(p.anchor_date, p.end_date, interval '1 day') as g
),
expected as (
  select
    d.target_date,
    e.full_name as expected_name
  from date_series d
  cross join params p
  join tmp_expected_members e
    on e.idx = (((d.target_date - p.anchor_date) % p.total) + p.total) % p.total
),
actual as (
  select
    d.target_date,
    (public.get_daily_prayer(d.target_date) -> 'member' ->> 'name') as actual_name
  from date_series d
)
select
  e.target_date,
  e.expected_name,
  a.actual_name,
  lower(trim(coalesce(a.actual_name, ''))) = lower(trim(e.expected_name)) as is_match
from expected e
join actual a using (target_date);

create temporary table tmp_missing_members as
select e.full_name
from tmp_expected_members e
left join public.members m
  on lower(trim(m.name)) = lower(trim(e.full_name))
 and coalesce(m.is_active, true) = true
where m.id is null;

-- 1) Missing expected active members.
select full_name
from tmp_missing_members
order by full_name;

-- 2) Total mismatch count for the checked range.
select count(*)::int as mismatch_count
from tmp_compare
where is_match = false;

-- 3) Detailed mismatches.
select
  target_date,
  expected_name,
  actual_name
from tmp_compare
where is_match = false
order by target_date;
