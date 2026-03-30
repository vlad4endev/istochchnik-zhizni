-- Force explicit one-time assignment for 2026-03-14.
-- Guarantees that this exact date returns "Гришин Алексей".

do $$
declare
  v_member_id integer;
begin
  select m.id
    into v_member_id
  from public.members m
  where trim(m.name) = 'Гришин Алексей'
  order by m.id asc
  limit 1;

  if v_member_id is null then
    select m.id
      into v_member_id
    from public.members m
    where lower(coalesce(trim(m.last_name), '')) = lower('Гришин')
      and lower(coalesce(trim(m.first_name), '')) = lower('Алексей')
    order by m.id asc
    limit 1;
  end if;

  if v_member_id is null then
    raise notice 'Member "Гришин Алексей" not found; override not created.';
    return;
  end if;

  insert into public.member_cycle_overrides (target_date, member_id)
  values (date '2026-03-14', v_member_id)
  on conflict (target_date)
  do update set member_id = excluded.member_id, updated_at = now();

  raise notice 'Override set: 2026-03-14 -> member id %', v_member_id;
end
$$;
