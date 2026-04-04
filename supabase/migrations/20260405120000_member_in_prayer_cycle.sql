-- Участие в молитвенном цикле: только участники с in_prayer_cycle попадают в очередь.
-- Существующие строки остаются в цикле; новые INSERT без колонки получают FALSE.

alter table public.members
  add column if not exists in_prayer_cycle boolean not null default true;

alter table public.members
  alter column in_prayer_cycle set default false;

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

create or replace function public.reset_cycle_on_member_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_today date := current_date;
  v_start_date date;
  v_old_total integer;
  v_new_total integer;
  v_old_index integer;
  v_old_member_id integer;
  v_new_index integer;
begin
  insert into public.global_settings (id, start_date)
  values (1, current_date)
  on conflict (id) do nothing;

  select start_date
    into v_start_date
  from public.global_settings
  where id = 1;

  if tg_op = 'insert' then
    if new.is_active is distinct from true or new.in_prayer_cycle is distinct from true then
      return null;
    end if;

    select count(*)::int
      into v_new_total
    from public.members
    where is_active = true and in_prayer_cycle = true;

    v_old_total := v_new_total - 1;
    if v_old_total <= 0 then
      update public.global_settings
      set start_date = v_today
      where id = 1;
      return null;
    end if;

    v_old_index := ((v_today - v_start_date) % v_old_total + v_old_total) % v_old_total;

    select m.id
      into v_old_member_id
    from public.members m
    where m.id <> new.id
      and m.is_active = true
      and m.in_prayer_cycle = true
    order by
      lower(coalesce(nullif(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1))) asc,
      lower(coalesce(nullif(trim(m.first_name), ''), m.name)) asc,
      m.id asc
    limit 1 offset v_old_index;

    if v_old_member_id is null then
      return null;
    end if;

    select ranked.idx
      into v_new_index
    from (
      select
        m.id,
        row_number() over (
          order by
            lower(coalesce(nullif(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1))) asc,
            lower(coalesce(nullif(trim(m.first_name), ''), m.name)) asc,
            m.id asc
        ) - 1 as idx
      from public.members m
      where m.is_active = true and m.in_prayer_cycle = true
    ) ranked
    where ranked.id = v_old_member_id;

    if v_new_index is null then
      return null;
    end if;

    update public.global_settings
    set start_date = v_today - v_new_index
    where id = 1;
    return null;
  end if;

  if old.is_active is distinct from true or old.in_prayer_cycle is distinct from true then
    return null;
  end if;

  update public.global_settings
  set start_date = v_today
  where id = 1;

  return null;
end;
$$;
