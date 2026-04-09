-- Разовая подмена дня (member_cycle_overrides) — только для тех же людей, что и основная очередь:
-- активные и с in_prayer_cycle = true (как в админке «Молитвенный календарь»).

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

  select (jsonb_set(
    to_jsonb(m),
    '{prayer_request}',
    to_jsonb(coalesce(mpc.prayer_request, m.prayer_request))
  ))::json
  into v_member_json
  from public.members m
  left join public.member_prayer_by_cycle mpc on mpc.member_id = m.id and mpc.cycle_index = v_cycle_index
  where m.is_active = true and m.in_prayer_cycle = true
  order by
    lower(coalesce(nullif(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1))) asc,
    lower(coalesce(nullif(trim(m.first_name), ''), m.name)) asc,
    m.id asc
  limit 1 offset v_index;

  return json_build_object('date', target_date, 'member', v_member_json);
end;
$$;
