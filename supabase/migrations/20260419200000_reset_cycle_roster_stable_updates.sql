-- Надёжная очередь цикла при UPDATE:
-- 1) смена ФИО у участника в цикле — сохраняем того же «сегодняшнего» по старой сортировке;
-- 2) деактивация при in_prayer_cycle = true — как выход из пула (без обнуления на первого в списке);
-- 3) повторная активация с участием в цикле — как вход в цикл;
-- 4) исправление состава «старой очереди» при выходе из цикла + деактивации (строка с NEW.is_active = false).

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
  v_pick_index integer;
  v_target_member_id integer;
begin
  insert into public.global_settings (id, start_date)
  values (1, current_date)
  on conflict (id) do nothing;

  select start_date
    into v_start_date
  from public.global_settings
  where id = 1;

  if tg_op = 'INSERT' then
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

  if tg_op = 'UPDATE' then
    -- Входит в молитвенный цикл (в т.ч. после повторной активации).
    if new.is_active is true
       and new.in_prayer_cycle is true
       and old.in_prayer_cycle is not true then
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

    -- Выходит из цикла (флаг): старая очередь с учётом того, что у строки ещё был active + in_cycle.
    if old.in_prayer_cycle is true and new.in_prayer_cycle is not true and old.is_active is true then
      select count(*)::int
        into v_new_total
      from public.members
      where is_active = true and in_prayer_cycle = true;

      if v_new_total <= 0 then
        update public.global_settings
        set start_date = v_today
        where id = 1;
        return null;
      end if;

      v_old_total := v_new_total + 1;
      v_old_index := ((v_today - v_start_date) % v_old_total + v_old_total) % v_old_total;

      select m.id
        into v_old_member_id
      from public.members m
      where (
          (m.id = new.id and old.in_prayer_cycle is true and old.is_active is true)
          or (m.id <> new.id and m.is_active is true and m.in_prayer_cycle is true)
        )
      order by
        case when m.id = new.id then
          lower(coalesce(nullif(trim(old.last_name), ''), split_part(trim(old.name), ' ', 1)))
        else
          lower(coalesce(nullif(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1)))
        end asc,
        case when m.id = new.id then
          lower(coalesce(nullif(trim(old.first_name), ''), old.name))
        else
          lower(coalesce(nullif(trim(m.first_name), ''), m.name))
        end asc,
        m.id asc
      limit 1 offset v_old_index;

      if v_old_member_id is null then
        return null;
      end if;

      if v_old_member_id = new.id then
        v_pick_index := (v_old_index + 1) % v_old_total;
        select m.id
          into v_target_member_id
        from public.members m
        where (
            (m.id = new.id and old.in_prayer_cycle is true and old.is_active is true)
            or (m.id <> new.id and m.is_active is true and m.in_prayer_cycle is true)
          )
        order by
          case when m.id = new.id then
            lower(coalesce(nullif(trim(old.last_name), ''), split_part(trim(old.name), ' ', 1)))
          else
            lower(coalesce(nullif(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1)))
          end asc,
          case when m.id = new.id then
            lower(coalesce(nullif(trim(old.first_name), ''), old.name))
          else
            lower(coalesce(nullif(trim(m.first_name), ''), m.name))
          end asc,
          m.id asc
        limit 1 offset v_pick_index;
      else
        v_target_member_id := v_old_member_id;
      end if;

      if v_target_member_id is null then
        update public.global_settings
        set start_date = v_today
        where id = 1;
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
      where ranked.id = v_target_member_id;

      if v_new_index is null then
        update public.global_settings
        set start_date = v_today
        where id = 1;
        return null;
      end if;

      update public.global_settings
      set start_date = v_today - v_new_index
      where id = 1;
      return null;
    end if;

    -- Деактивация, но флаг «в цикле» остался true — убираем из пула по факту как выше.
    if old.is_active is true
       and new.is_active is not true
       and old.in_prayer_cycle is true
       and new.in_prayer_cycle is true then
      select count(*)::int
        into v_new_total
      from public.members
      where is_active = true and in_prayer_cycle = true;

      if v_new_total <= 0 then
        update public.global_settings
        set start_date = v_today
        where id = 1;
        return null;
      end if;

      v_old_total := v_new_total + 1;
      v_old_index := ((v_today - v_start_date) % v_old_total + v_old_total) % v_old_total;

      select m.id
        into v_old_member_id
      from public.members m
      where (
          (m.id = new.id and old.in_prayer_cycle is true and old.is_active is true)
          or (m.id <> new.id and m.is_active is true and m.in_prayer_cycle is true)
        )
      order by
        case when m.id = new.id then
          lower(coalesce(nullif(trim(old.last_name), ''), split_part(trim(old.name), ' ', 1)))
        else
          lower(coalesce(nullif(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1)))
        end asc,
        case when m.id = new.id then
          lower(coalesce(nullif(trim(old.first_name), ''), old.name))
        else
          lower(coalesce(nullif(trim(m.first_name), ''), m.name))
        end asc,
        m.id asc
      limit 1 offset v_old_index;

      if v_old_member_id is null then
        return null;
      end if;

      if v_old_member_id = new.id then
        v_pick_index := (v_old_index + 1) % v_old_total;
        select m.id
          into v_target_member_id
        from public.members m
        where (
            (m.id = new.id and old.in_prayer_cycle is true and old.is_active is true)
            or (m.id <> new.id and m.is_active is true and m.in_prayer_cycle is true)
          )
        order by
          case when m.id = new.id then
            lower(coalesce(nullif(trim(old.last_name), ''), split_part(trim(old.name), ' ', 1)))
          else
            lower(coalesce(nullif(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1)))
          end asc,
          case when m.id = new.id then
            lower(coalesce(nullif(trim(old.first_name), ''), old.name))
          else
            lower(coalesce(nullif(trim(m.first_name), ''), m.name))
          end asc,
          m.id asc
        limit 1 offset v_pick_index;
      else
        v_target_member_id := v_old_member_id;
      end if;

      if v_target_member_id is null then
        update public.global_settings
        set start_date = v_today
        where id = 1;
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
      where ranked.id = v_target_member_id;

      if v_new_index is null then
        update public.global_settings
        set start_date = v_today
        where id = 1;
        return null;
      end if;

      update public.global_settings
      set start_date = v_today - v_new_index
      where id = 1;
      return null;
    end if;

    -- Смена ФИО у активного участника цикла: порядок в списке мог измениться, якорь подстраиваем.
    if new.is_active is true
       and old.is_active is true
       and new.in_prayer_cycle is true
       and old.in_prayer_cycle is true
       and (
         old.first_name is distinct from new.first_name
         or old.last_name is distinct from new.last_name
         or old.name is distinct from new.name
       ) then
      select count(*)::int
        into v_new_total
      from public.members
      where is_active = true and in_prayer_cycle = true;

      if v_new_total <= 0 then
        return null;
      end if;

      v_old_index := ((v_today - v_start_date) % v_new_total + v_new_total) % v_new_total;

      select m.id
        into v_old_member_id
      from public.members m
      where m.is_active = true and m.in_prayer_cycle = true
      order by
        case when m.id = new.id then
          lower(coalesce(nullif(trim(old.last_name), ''), split_part(trim(old.name), ' ', 1)))
        else
          lower(coalesce(nullif(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1)))
        end asc,
        case when m.id = new.id then
          lower(coalesce(nullif(trim(old.first_name), ''), old.name))
        else
          lower(coalesce(nullif(trim(m.first_name), ''), m.name))
        end asc,
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

    return null;
  end if;

  if tg_op = 'DELETE' then
    if old.is_active is distinct from true or old.in_prayer_cycle is distinct from true then
      return null;
    end if;

    select count(*)::int
      into v_new_total
    from public.members
    where is_active = true and in_prayer_cycle = true;

    if v_new_total <= 0 then
      update public.global_settings
      set start_date = v_today
      where id = 1;
      return null;
    end if;

    v_old_total := v_new_total + 1;
    v_old_index := ((v_today - v_start_date) % v_old_total + v_old_total) % v_old_total;

    with roster as (
      select
        m.id,
        lower(coalesce(nullif(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1))) as sort_ln,
        lower(coalesce(nullif(trim(m.first_name), ''), m.name)) as sort_fn
      from public.members m
      where m.is_active = true and m.in_prayer_cycle = true
      union all
      select
        old.id,
        lower(coalesce(nullif(trim(old.last_name), ''), split_part(trim(old.name), ' ', 1))),
        lower(coalesce(nullif(trim(old.first_name), ''), old.name))
    )
    select r.id
      into v_old_member_id
    from roster r
    order by r.sort_ln asc, r.sort_fn asc, r.id asc
    limit 1 offset v_old_index;

    if v_old_member_id is null then
      return null;
    end if;

    if v_old_member_id = old.id then
      v_pick_index := (v_old_index + 1) % v_old_total;
      with roster as (
        select
          m.id,
          lower(coalesce(nullif(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1))) as sort_ln,
          lower(coalesce(nullif(trim(m.first_name), ''), m.name)) as sort_fn
        from public.members m
        where m.is_active = true and m.in_prayer_cycle = true
        union all
        select
          old.id,
          lower(coalesce(nullif(trim(old.last_name), ''), split_part(trim(old.name), ' ', 1))),
          lower(coalesce(nullif(trim(old.first_name), ''), old.name))
      )
      select r.id
        into v_target_member_id
      from roster r
      order by r.sort_ln asc, r.sort_fn asc, r.id asc
      limit 1 offset v_pick_index;
    else
      v_target_member_id := v_old_member_id;
    end if;

    if v_target_member_id is null then
      update public.global_settings
      set start_date = v_today
      where id = 1;
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
    where ranked.id = v_target_member_id;

    if v_new_index is null then
      update public.global_settings
      set start_date = v_today
      where id = 1;
      return null;
    end if;

    update public.global_settings
    set start_date = v_today - v_new_index
    where id = 1;
    return null;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_reset_cycle_on_member_change on public.members;

create trigger trg_reset_cycle_on_member_change
after insert or update or delete on public.members
for each row
execute function public.reset_cycle_on_member_change();
