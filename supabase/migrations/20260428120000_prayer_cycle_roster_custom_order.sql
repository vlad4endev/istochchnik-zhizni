-- Порядок участников молитвенного цикла вручную на один cycle_index; на следующем цикле записи нет — снова сортировка А–Я.

create table if not exists public.prayer_cycle_roster_custom_order (
  cycle_index bigint not null primary key,
  member_ids integer[] not null,
  updated_at timestamptz not null default now()
);

create or replace function public.resolve_prayer_cycle_roster_member_ids(p_cycle_index bigint)
returns integer[]
language plpgsql
stable
set search_path = public
as $fn$
declare
  v_alpha integer[];
  v_custom integer[];
  v_out integer[];
  r int;
  k int;
begin
  select array_agg(sub.id order by sub.sn)
  into v_alpha
  from (
    select
      m.id,
      row_number() over (
        order by
          lower(coalesce(nullif(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1))) asc,
          lower(coalesce(nullif(trim(m.first_name), ''), m.name)) asc,
          m.id asc
      ) as sn
    from public.members m
    where m.is_active = true and m.in_prayer_cycle = true
  ) sub;

  if v_alpha is null then
    return array[]::integer[];
  end if;

  select cro.member_ids
  into v_custom
  from public.prayer_cycle_roster_custom_order cro
  where cro.cycle_index = p_cycle_index;

  if v_custom is null or cardinality(v_custom) = 0 then
    return v_alpha;
  end if;

  v_out := array[]::integer[];
  foreach r in array v_custom loop
    if r = any(v_alpha) and not (r = any(v_out)) then
      v_out := v_out || r;
    end if;
  end loop;
  foreach k in array v_alpha loop
    if not (k = any(v_out)) then
      v_out := v_out || k;
    end if;
  end loop;
  return v_out;
end;
$fn$;

create or replace function public.get_daily_prayer(target_date date)
returns json
language plpgsql
set search_path = public
as $$
declare
  v_start_date date;
  v_day_diff integer;
  v_total_members integer;
  v_index integer;
  v_cycle_index bigint;
  v_member_json json;
  v_ids integer[];
  v_pick integer;
begin
  insert into public.global_settings (id, start_date)
  values (1, current_date)
  on conflict (id) do nothing;

  select start_date into v_start_date from public.global_settings where id = 1;

  v_day_diff := target_date - v_start_date;

  select count(*)::integer into v_total_members
  from public.members
  where is_active = true and in_prayer_cycle = true;

  if v_total_members = 0 then
    return json_build_object('date', target_date, 'member', null);
  end if;

  v_cycle_index := floor(v_day_diff::numeric / v_total_members)::bigint;
  v_index := ((v_day_diff % v_total_members) + v_total_members) % v_total_members;

  select (jsonb_set(
    to_jsonb(m),
    '{prayer_request}',
    to_jsonb(coalesce(mpc.prayer_request, m.prayer_request))
  ))::json
  into v_member_json
  from public.member_cycle_overrides o
  join public.members m on m.id = o.member_id
  left join public.member_prayer_by_cycle mpc on mpc.member_id = m.id and mpc.cycle_index = v_cycle_index
  where o.target_date = target_date
    and m.is_active = true
    and m.in_prayer_cycle = true
  limit 1;

  if found then
    return json_build_object('date', target_date, 'member', v_member_json);
  end if;

  v_ids := public.resolve_prayer_cycle_roster_member_ids(v_cycle_index);
  if v_ids is null or cardinality(v_ids) = 0 then
    return json_build_object('date', target_date, 'member', null);
  end if;

  v_pick := v_ids[v_index + 1];

  select (jsonb_set(
    to_jsonb(m),
    '{prayer_request}',
    to_jsonb(coalesce(mpc.prayer_request, m.prayer_request))
  ))::json
  into v_member_json
  from public.members m
  left join public.member_prayer_by_cycle mpc on mpc.member_id = m.id and mpc.cycle_index = v_cycle_index
  where m.is_active = true
    and m.in_prayer_cycle = true
    and m.id = v_pick
  limit 1;

  return json_build_object('date', target_date, 'member', v_member_json);
end;
$$;
