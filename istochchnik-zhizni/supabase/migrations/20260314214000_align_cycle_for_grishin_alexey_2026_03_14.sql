-- Align cycle so that 2026-03-14 maps to "Гришин Алексей".
-- This updates only global_settings.start_date (base cycle anchor).

do $$
declare
  v_target_date constant date := date '2026-03-14';
  v_target_member_id integer;
  v_target_index integer;
begin
  -- Ensure global settings row exists.
  insert into public.global_settings (id, start_date)
  values (1, current_date)
  on conflict (id) do nothing;

  -- Prefer exact full-name match from members.name.
  select m.id
    into v_target_member_id
  from public.members m
  where trim(m.name) = 'Гришин Алексей'
    and coalesce(m.is_active, true) = true
  order by m.id asc
  limit 1;

  if v_target_member_id is null then
    -- Fallback for datasets where first_name/last_name are filled.
    select m.id
      into v_target_member_id
    from public.members m
    where lower(coalesce(trim(m.last_name), '')) = lower('Гришин')
      and lower(coalesce(trim(m.first_name), '')) = lower('Алексей')
      and coalesce(m.is_active, true) = true
    order by m.id asc
    limit 1;
  end if;

  if v_target_member_id is null then
    raise notice 'Member "Гришин Алексей" not found. Cycle anchor was not changed.';
    return;
  end if;

  -- Compute current zero-based position in the same sort order used by cycle.
  select ranked.idx
    into v_target_index
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
    where coalesce(m.is_active, true) = true
  ) ranked
  where ranked.id = v_target_member_id;

  if v_target_index is null then
    raise notice 'Failed to compute target index for member id %.', v_target_member_id;
    return;
  end if;

  -- If index(date) = (target_date - start_date) mod N, then
  -- start_date = target_date - target_index.
  update public.global_settings
  set start_date = v_target_date - v_target_index
  where id = 1;

  raise notice 'Cycle aligned: % -> member id %, index %, start_date %',
    v_target_date, v_target_member_id, v_target_index, (v_target_date - v_target_index);
end
$$;
