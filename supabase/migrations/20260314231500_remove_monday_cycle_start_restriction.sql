-- Remove mandatory Monday anchor for cycle reset.
-- Cycle start should now follow the selected/current date directly.

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
  values (1, current_date)
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

  -- Deleting a member restarts cycle from the current date.
  update public.global_settings
  set start_date = v_today
  where id = 1;

  return null;
end;
$$;
