-- Prayer cycle support: global settings, daily RPC, and reset trigger.

create table if not exists public.global_settings (
  id integer primary key check (id = 1),
  start_date date not null
);

insert into public.global_settings (id, start_date)
values (1, current_date)
on conflict (id) do nothing;

create or replace function public.get_daily_prayer(target_date date)
returns json
language plpgsql
as $$
declare
  v_start_date date;
  v_day_diff integer;
  v_total_members integer;
  v_index integer;
  v_member public.members%rowtype;
begin
  -- Ensure settings row always exists.
  insert into public.global_settings (id, start_date)
  values (1, current_date)
  on conflict (id) do nothing;

  select gs.start_date
    into v_start_date
  from public.global_settings gs
  where gs.id = 1;

  v_day_diff := target_date - v_start_date;

  select count(*)::integer
    into v_total_members
  from public.members;

  if v_total_members = 0 then
    return json_build_object(
      'date', target_date,
      'member', null
    );
  end if;

  -- Keep modulo positive for past dates.
  v_index := ((v_day_diff % v_total_members) + v_total_members) % v_total_members;

  select m.*
    into v_member
  from public.members m
  order by m.name asc, m.id asc
  limit 1
  offset v_index;

  return json_build_object(
    'date', target_date,
    'member', row_to_json(v_member)
  );
end;
$$;

create or replace function public.reset_cycle_on_member_change()
returns trigger
language plpgsql
as $$
begin
  insert into public.global_settings (id, start_date)
  values (1, current_date)
  on conflict (id)
  do update set start_date = excluded.start_date;

  return null;
end;
$$;

drop trigger if exists trg_reset_cycle_on_member_change on public.members;

create trigger trg_reset_cycle_on_member_change
after insert or delete on public.members
for each statement
execute function public.reset_cycle_on_member_change();
