-- Align base cycle to match sheet period:
-- 2026-03-05 must map to "Беспалова Татьяна".
-- After 2026-06-09 cycle continues automatically by base logic.

do $$
declare
  v_anchor_date constant date := date '2026-03-05';
  v_anchor_member_id integer;
  v_anchor_index integer;
begin
  -- Ensure single settings row exists.
  insert into public.global_settings (id, start_date)
  values (1, current_date)
  on conflict (id) do nothing;

  -- Remove one-time date overrides for the requested period
  -- so base cyclic mapping is used exactly.
  delete from public.member_cycle_overrides
  where target_date between date '2026-03-05' and date '2026-06-09';

  -- Find anchor member from sheet start date.
  select m.id
    into v_anchor_member_id
  from public.members m
  where trim(m.name) = 'Беспалова Татьяна'
    and coalesce(m.is_active, true) = true
  order by m.id asc
  limit 1;

  if v_anchor_member_id is null then
    select m.id
      into v_anchor_member_id
    from public.members m
    where lower(coalesce(trim(m.last_name), '')) = lower('Беспалова')
      and lower(coalesce(trim(m.first_name), '')) = lower('Татьяна')
      and coalesce(m.is_active, true) = true
    order by m.id asc
    limit 1;
  end if;

  if v_anchor_member_id is null then
    raise notice 'Anchor member "Беспалова Татьяна" not found. Cycle anchor was not changed.';
    return;
  end if;

  -- Compute zero-based position in the same order used by cycle.
  select ranked.idx
    into v_anchor_index
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
  where ranked.id = v_anchor_member_id;

  if v_anchor_index is null then
    raise notice 'Failed to compute index for anchor member id %.', v_anchor_member_id;
    return;
  end if;

  -- index(date) = (date - start_date) mod N
  -- => start_date = anchor_date - anchor_index
  update public.global_settings
  set start_date = v_anchor_date - v_anchor_index
  where id = 1;

  raise notice 'Cycle aligned to sheet start: % -> member id %, index %, start_date %',
    v_anchor_date, v_anchor_member_id, v_anchor_index, (v_anchor_date - v_anchor_index);
end
$$;
