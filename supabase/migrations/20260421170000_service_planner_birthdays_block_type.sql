insert into public.block_types (code, name, kind, icon, default_duration_minutes)
values ('birthdays', 'Дни рождения', 'custom', 'cake-candles', 4)
on conflict (code) do update
set
  name = excluded.name,
  kind = excluded.kind,
  icon = excluded.icon,
  default_duration_minutes = excluded.default_duration_minutes;
