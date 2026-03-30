-- Ensure automatic cycle reset always starts from Monday.

create or replace function public.reset_cycle_on_member_change()
returns trigger
language plpgsql
as $$
begin
  insert into public.global_settings (id, start_date)
  values (1, date_trunc('week', current_date::timestamp)::date)
  on conflict (id)
  do update set start_date = excluded.start_date;

  return null;
end;
$$;
