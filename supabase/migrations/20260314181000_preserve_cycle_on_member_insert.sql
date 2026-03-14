-- Keep cycle stable on member INSERT and sort members by surname key.
-- Surname key is interpreted as the first token in `name`.

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

create or replace function public.reset_cycle_on_member_change()
returns trigger
language plpgsql
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
  values (1, date_trunc('week', current_date::timestamp)::date)
  on conflict (id) do nothing;

  select start_date
    into v_start_date
  from public.global_settings
  where id = 1;

  if tg_op = 'INSERT' then
    select count(*)::int
      into v_new_total
    from public.members;

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
    order by
      lower(split_part(trim(m.name), ' ', 1)) asc,
      lower(m.name) asc,
      m.id asc
    limit 1
    offset v_old_index;

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
            lower(split_part(trim(m.name), ' ', 1)) asc,
            lower(m.name) asc,
            m.id asc
        ) - 1 as idx
      from public.members m
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

  -- Deleting a member restarts cycle from Monday of current week.
  update public.global_settings
  set start_date = date_trunc('week', v_today::timestamp)::date
  where id = 1;

  return null;
end;
$$;

drop trigger if exists trg_reset_cycle_on_member_change on public.members;

create trigger trg_reset_cycle_on_member_change
after insert or delete on public.members
for each row
execute function public.reset_cycle_on_member_change();
