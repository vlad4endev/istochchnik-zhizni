-- Manual self-check for prayer cycle logic.
-- Run after migrations:
--   psql "$DATABASE_URL" -f scripts/prayer_cycle_self_check.sql

do $$
declare
  v_start_date date;
  v_total_members integer;
  v_day_offset integer;
  v_target_date date;
  v_expected_member_id bigint;
  v_actual json;
  v_actual_member_id bigint;
  v_mismatch_count integer := 0;
begin
  select gs.start_date
    into v_start_date
  from public.global_settings gs
  where gs.id = 1;

  if v_start_date is null then
    raise exception 'global_settings row (id=1) is missing.';
  end if;

  select count(*)::integer
    into v_total_members
  from public.members;

  if v_total_members = 0 then
    v_actual := public.get_daily_prayer(v_start_date);
    if (v_actual -> 'member') is not null then
      raise exception 'Expected member = null when members is empty. Got: %', v_actual::text;
    end if;

    raise notice 'Self-check passed: members is empty and RPC returns member=null.';
    return;
  end if;

  for v_day_offset in -10..10 loop
    v_target_date := v_start_date + v_day_offset;

    select m.id
      into v_expected_member_id
    from public.members m
    order by
      lower(split_part(trim(m.name), ' ', 1)) asc,
      lower(m.name) asc,
      m.id asc
    limit 1
    offset (((v_day_offset % v_total_members) + v_total_members) % v_total_members);

    v_actual := public.get_daily_prayer(v_target_date);
    v_actual_member_id := nullif(v_actual #>> '{member,id}', '')::bigint;

    if v_actual_member_id is distinct from v_expected_member_id then
      v_mismatch_count := v_mismatch_count + 1;
      raise notice 'Mismatch at %: expected member_id=%, got member_id=%',
        v_target_date, v_expected_member_id, v_actual_member_id;
    end if;
  end loop;

  if v_mismatch_count > 0 then
    raise exception 'Prayer cycle self-check failed. Mismatches: %', v_mismatch_count;
  end if;

  raise notice 'Prayer cycle self-check passed for offsets -10..10.';
end
$$;

-- Optional visual preview for nearest 7 days.
with gs as (
  select start_date
  from public.global_settings
  where id = 1
),
series as (
  select (gs.start_date + x.day_offset) as target_date, x.day_offset
  from gs
  cross join generate_series(-3, 3) as x(day_offset)
)
select
  s.target_date,
  (public.get_daily_prayer(s.target_date) #>> '{member,id}')::bigint as member_id,
  public.get_daily_prayer(s.target_date) #>> '{member,name}' as member_name
from series s
order by s.target_date;
