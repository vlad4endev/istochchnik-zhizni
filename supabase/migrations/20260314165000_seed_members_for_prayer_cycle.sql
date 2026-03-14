-- Seed members for manual prayer-cycle testing.
-- Inserts only when members table is empty.

do $$
begin
  if not exists (select 1 from public.members) then
    insert into public.members (name, prayer_request)
    values
      ('Анна', 'Молитва за семью и мир в доме'),
      ('Борис', 'Молитва за здоровье и восстановление'),
      ('Виктория', 'Молитва за мудрость в служении'),
      ('Григорий', 'Молитва за работу и открытые двери'),
      ('Дарья', 'Молитва за духовный рост и дисциплину');
  end if;
end
$$;
