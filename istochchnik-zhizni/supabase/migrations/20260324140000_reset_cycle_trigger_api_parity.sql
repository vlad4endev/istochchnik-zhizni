-- Триггер сброса цикла молитвы: как в src/config/initDb.ts и calendarService
-- (только is_active = true, сортировка по фамилии/имени).

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

  if tg_op = 'INSERT' then
    if new.is_active is distinct from true then
      return null;
    end if;

    select count(*)::int
      into v_new_total
    from public.members
    where is_active = true;

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
      where m.is_active = true
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

  if old.is_active is distinct from true then
    return null;
  end if;

  update public.global_settings
  set start_date = v_today
  where id = 1;

  return null;
end;
$$;

drop trigger if exists trg_reset_cycle_on_member_change on public.members;

create trigger trg_reset_cycle_on_member_change
after insert or delete on public.members
for each row
execute function public.reset_cycle_on_member_change();
