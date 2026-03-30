-- One-time member assignment for a specific date without shifting base cycle.

create table if not exists public.member_cycle_overrides (
  target_date date primary key,
  member_id integer not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  insert into public.global_settings (id, start_date)
  values (1, current_date)
  on conflict (id) do nothing;

  -- 1) One-time override has priority for exact date.
  select m.*
    into v_member
  from public.member_cycle_overrides o
  join public.members m on m.id = o.member_id
  where o.target_date = target_date
  limit 1;

  if found then
    return json_build_object(
      'date', target_date,
      'member', row_to_json(v_member)
    );
  end if;

  -- 2) Fallback to base cyclic member selection.
  select gs.start_date
    into v_start_date
  from public.global_settings gs
  where gs.id = 1;

  v_day_diff := target_date - v_start_date;

  select count(*)::integer
    into v_total_members
  from public.members;

  if v_total_members = 0 then
    return json_build_object('date', target_date, 'member', null);
  end if;

  v_index := ((v_day_diff % v_total_members) + v_total_members) % v_total_members;

  select m.*
    into v_member
  from public.members m
  order by
    lower(split_part(trim(m.name), ' ', 1)) asc,
    lower(m.name) asc,
    m.id asc
  limit 1
  offset v_index;

  return json_build_object(
    'date', target_date,
    'member', row_to_json(v_member)
  );
end;
$$;
