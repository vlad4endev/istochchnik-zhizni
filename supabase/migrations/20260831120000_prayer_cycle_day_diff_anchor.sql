-- Молитвенный цикл: позиция дня = target_date - start_date (без смещения по понедельнику).
-- Так «Первым сегодня» сдвигает только якорь, очередь остаётся А–Я по кругу.

CREATE OR REPLACE FUNCTION get_daily_prayer(target_date date)
RETURNS json
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_start_date date;
  v_position integer;
  v_total_members integer;
  v_index integer;
  v_cycle_index bigint;
  v_member_json json;
  v_ids integer[];
  v_pick integer;
BEGIN
  INSERT INTO global_settings (id, start_date)
  VALUES (1, CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;

  SELECT start_date INTO v_start_date FROM global_settings WHERE id = 1;

  v_position := target_date - v_start_date;

  SELECT COUNT(*)::integer INTO v_total_members
  FROM members
  WHERE is_active = TRUE AND in_prayer_cycle = TRUE;

  IF v_total_members = 0 THEN
    RETURN json_build_object('date', target_date, 'member', NULL);
  END IF;

  v_cycle_index := FLOOR(v_position::numeric / v_total_members)::bigint;
  v_index := ((v_position % v_total_members) + v_total_members) % v_total_members;

  SELECT (jsonb_set(
    to_jsonb(m),
    '{prayer_request}',
    to_jsonb(NULLIF(TRIM(mpc.prayer_request), ''))
  ))::json
  INTO v_member_json
  FROM member_cycle_overrides o
  JOIN members m ON m.id = o.member_id
  LEFT JOIN member_prayer_by_cycle mpc ON mpc.member_id = m.id AND mpc.cycle_index = v_cycle_index
  WHERE o.target_date = target_date
    AND m.is_active = TRUE
    AND m.in_prayer_cycle = TRUE
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object('date', target_date, 'member', v_member_json);
  END IF;

  v_ids := resolve_prayer_cycle_roster_member_ids(v_cycle_index);
  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    RETURN json_build_object('date', target_date, 'member', NULL);
  END IF;

  v_pick := v_ids[v_index + 1];

  SELECT (jsonb_set(
    to_jsonb(m),
    '{prayer_request}',
    to_jsonb(NULLIF(TRIM(mpc.prayer_request), ''))
  ))::json
  INTO v_member_json
  FROM members m
  LEFT JOIN member_prayer_by_cycle mpc ON mpc.member_id = m.id AND mpc.cycle_index = v_cycle_index
  WHERE m.is_active = TRUE
    AND m.in_prayer_cycle = TRUE
    AND m.id = v_pick
  LIMIT 1;

  RETURN json_build_object('date', target_date, 'member', v_member_json);
END;
$$;
