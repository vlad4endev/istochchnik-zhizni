import { pool } from './db';
import { MEMBER_SEED_SQL } from './memberSeedSql';
import { mergeDuplicateMembersBootPatchIfNeeded } from '../services/memberMergeService';

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(120),
  last_name VARCHAR(120),
  name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  login VARCHAR(64),
  password_hash TEXT,
  phone_number VARCHAR(32),
  telegram_chat_id VARCHAR(64),
  ministry_role VARCHAR(120),
  ministry_direction VARCHAR(120),
  prayer_request TEXT,
  birth_date DATE,
  email VARCHAR(255),
  account_provider VARCHAR(100),
  account_id VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  app_role VARCHAR(16) NOT NULL DEFAULT 'member' CHECK (app_role IN ('member', 'minister', 'pastor', 'musician', 'editor', 'admin')),
  app_roles TEXT[] NOT NULL DEFAULT ARRAY['member'],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS global_themes (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  bible_verse TEXT,
  prayer_points TEXT
);

CREATE TABLE IF NOT EXISTS ministries (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  prayer_points TEXT
);

CREATE TABLE IF NOT EXISTS backsliders (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS church_events (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  event_time TIME NOT NULL,
  recurrence_type VARCHAR(16) NOT NULL DEFAULT 'once' CHECK (recurrence_type IN ('once', 'weekly')),
  weekly_day SMALLINT CHECK (weekly_day BETWEEN 0 AND 6),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Старые БД: таблица church_events уже есть без event_date/event_time (CREATE IF NOT EXISTS не меняет схему)
ALTER TABLE church_events ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE church_events ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE church_events ADD COLUMN IF NOT EXISTS event_date DATE;
ALTER TABLE church_events ADD COLUMN IF NOT EXISTS event_time TIME;
ALTER TABLE church_events ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE church_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE church_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE church_events SET title = 'Событие' WHERE title IS NULL;
UPDATE church_events SET event_date = CURRENT_DATE WHERE event_date IS NULL;
UPDATE church_events SET event_time = '12:00'::time WHERE event_time IS NULL;

ALTER TABLE church_events ALTER COLUMN title SET NOT NULL;
ALTER TABLE church_events ALTER COLUMN event_date SET NOT NULL;
ALTER TABLE church_events ALTER COLUMN event_time SET NOT NULL;

-- Старые схемы (Supabase и др.): description мог быть NOT NULL — API допускает пустое описание.
ALTER TABLE church_events ALTER COLUMN description DROP NOT NULL;

ALTER TABLE church_events ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
ALTER TABLE church_events ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS ministry_role_templates (
  id SERIAL PRIMARY KEY,
  title VARCHAR(120) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ministry_direction_templates (
  id SERIAL PRIMARY KEY,
  title VARCHAR(120) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ministry templates: roles <-> directions mapping
CREATE TABLE IF NOT EXISTS ministry_direction_role_templates (
  direction_template_id INTEGER NOT NULL REFERENCES ministry_direction_templates(id) ON DELETE CASCADE,
  role_template_id INTEGER NOT NULL REFERENCES ministry_role_templates(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (direction_template_id, role_template_id)
);

CREATE TABLE IF NOT EXISTS global_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  start_date DATE NOT NULL,
  rutube_embed_code TEXT,
  telegram_bot_token TEXT,
  telegram_prayer_chat_id TEXT,
  telegram_coordinator_chat_id TEXT,
  telegram_default_chat_id TEXT,
  telegram_prayer_template TEXT,
  telegram_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  telegram_dispatch_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  telegram_dispatch_kind VARCHAR(16) NOT NULL DEFAULT 'daily',
  telegram_dispatch_time VARCHAR(5),
  telegram_dispatch_once_at TIMESTAMPTZ,
  telegram_dispatch_target VARCHAR(16) NOT NULL DEFAULT 'all',
  telegram_dispatch_member_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  telegram_dispatch_last_sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS broadcasts (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(255),
  description TEXT,
  starts_at TIMESTAMP,
  source_service_plan_id BIGINT,
  platform VARCHAR(20) NOT NULL DEFAULT 'youtube',
  stream_url TEXT,
  notify_members BOOLEAN NOT NULL DEFAULT TRUE,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS member_cycle_overrides (
  target_date DATE PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS member_prayer_request_history (
  id BIGSERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  prayer_request TEXT NOT NULL,
  cycle_index BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS member_previous_prayer_needs_manual (
  id BIGSERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS member_prayer_by_cycle (
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  cycle_index BIGINT NOT NULL,
  prayer_request TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (member_id, cycle_index)
);

CREATE INDEX IF NOT EXISTS idx_member_prayer_by_cycle_cycle
  ON member_prayer_by_cycle (cycle_index);

CREATE TABLE IF NOT EXISTS prayer_cycle_roster_custom_order (
  cycle_index BIGINT NOT NULL PRIMARY KEY,
  member_ids INTEGER[] NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_member_previous_prayer_needs_manual_member_created
  ON member_previous_prayer_needs_manual (member_id, created_at DESC);

ALTER TABLE member_prayer_request_history ADD COLUMN IF NOT EXISTS cycle_index BIGINT;

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS access_requests (
  id BIGSERIAL PRIMARY KEY,
  first_name VARCHAR(120) NOT NULL,
  last_name VARCHAR(120) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(32) NOT NULL,
  phone_digits VARCHAR(20) NOT NULL,
  password_hash TEXT NOT NULL,
  request_type VARCHAR(32) NOT NULL DEFAULT 'registration' CHECK (request_type IN ('registration', 'password_reset')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  reviewed_by_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fix foreign keys for existing tables to include ON DELETE CASCADE / SET NULL
ALTER TABLE member_cycle_overrides DROP CONSTRAINT IF EXISTS member_cycle_overrides_member_id_fkey;
ALTER TABLE member_cycle_overrides ADD CONSTRAINT member_cycle_overrides_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;

ALTER TABLE member_prayer_request_history DROP CONSTRAINT IF EXISTS member_prayer_request_history_member_id_fkey;
ALTER TABLE member_prayer_request_history ADD CONSTRAINT member_prayer_request_history_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;

ALTER TABLE member_prayer_by_cycle DROP CONSTRAINT IF EXISTS member_prayer_by_cycle_member_id_fkey;
ALTER TABLE member_prayer_by_cycle ADD CONSTRAINT member_prayer_by_cycle_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;

ALTER TABLE auth_sessions DROP CONSTRAINT IF EXISTS auth_sessions_member_id_fkey;
ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;

ALTER TABLE access_requests DROP CONSTRAINT IF EXISTS access_requests_member_id_fkey;
ALTER TABLE access_requests ADD CONSTRAINT access_requests_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;

ALTER TABLE access_requests DROP CONSTRAINT IF EXISTS access_requests_reviewed_by_member_id_fkey;
ALTER TABLE access_requests ADD CONSTRAINT access_requests_reviewed_by_member_id_fkey FOREIGN KEY (reviewed_by_member_id) REFERENCES members(id) ON DELETE SET NULL;

ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS request_type VARCHAR(32);
UPDATE access_requests
SET request_type = 'registration'
WHERE request_type IS NULL OR request_type NOT IN ('registration', 'password_reset');
ALTER TABLE access_requests ALTER COLUMN request_type SET DEFAULT 'registration';
ALTER TABLE access_requests ALTER COLUMN request_type SET NOT NULL;
ALTER TABLE access_requests DROP CONSTRAINT IF EXISTS access_requests_request_type_check;
ALTER TABLE access_requests ADD CONSTRAINT access_requests_request_type_check CHECK (request_type IN ('registration', 'password_reset'));

-- global_settings: строка (id=1) создаётся в ensurePrayerCycleAnchor() после initDb — не затирать якорь при обновлениях.

ALTER TABLE members ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS first_name VARCHAR(120);
ALTER TABLE members ADD COLUMN IF NOT EXISTS last_name VARCHAR(120);
ALTER TABLE members ADD COLUMN IF NOT EXISTS login VARCHAR(64);
ALTER TABLE members ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS phone_number VARCHAR(32);
ALTER TABLE members ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(64);
ALTER TABLE members ADD COLUMN IF NOT EXISTS telegram_delivery_blocked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS telegram_delivery_block_reason TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS telegram_delivery_blocked_at TIMESTAMPTZ;
ALTER TABLE members ADD COLUMN IF NOT EXISTS ministry_role VARCHAR(120);
ALTER TABLE members ADD COLUMN IF NOT EXISTS ministry_direction VARCHAR(120);
ALTER TABLE members ADD COLUMN IF NOT EXISTS app_role VARCHAR(16) NOT NULL DEFAULT 'member';
ALTER TABLE members ADD COLUMN IF NOT EXISTS app_roles TEXT[];
ALTER TABLE members ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE members ADD COLUMN IF NOT EXISTS account_provider VARCHAR(100);
ALTER TABLE members ADD COLUMN IF NOT EXISTS account_id VARCHAR(255);
ALTER TABLE members ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS registration_status VARCHAR(32) NOT NULL DEFAULT 'active';
UPDATE members SET registration_status = 'active' WHERE registration_status IS NULL OR trim(registration_status) = '';
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_registration_status_check;
ALTER TABLE members ADD CONSTRAINT members_registration_status_check
  CHECK (registration_status IN ('active', 'pending_review', 'rejected'));
ALTER TABLE members ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE members
SET app_role = 'member'
WHERE app_role IS NULL OR app_role NOT IN ('member', 'minister', 'pastor', 'musician', 'editor', 'admin');
UPDATE members
SET app_roles = ARRAY[app_role]
WHERE app_roles IS NULL OR cardinality(app_roles) = 0;
ALTER TABLE members ALTER COLUMN app_roles SET DEFAULT ARRAY['member'];
ALTER TABLE members ALTER COLUMN app_roles SET NOT NULL;
ALTER TABLE members ALTER COLUMN app_role SET DEFAULT 'member';
ALTER TABLE members ALTER COLUMN app_role SET NOT NULL;
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_app_role_check;
ALTER TABLE members ADD CONSTRAINT members_app_role_check CHECK (app_role IN ('member', 'minister', 'pastor', 'musician', 'editor', 'admin'));

ALTER TABLE members ADD COLUMN IF NOT EXISTS is_collection_coordinator BOOLEAN NOT NULL DEFAULT FALSE;

-- Публичный UUID пользователя (генерируется при INSERT, в т.ч. при регистрации).
ALTER TABLE members ADD COLUMN IF NOT EXISTS user_id UUID;
UPDATE members SET user_id = gen_random_uuid() WHERE user_id IS NULL;
ALTER TABLE members ALTER COLUMN user_id SET DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS members_user_id_uidx ON members (user_id);
ALTER TABLE members ALTER COLUMN user_id SET NOT NULL;

-- Мессенджер: время последнего ухода из сети (для «был(а) …»).
ALTER TABLE members ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Участие в общем молитвенном цикле: новые записи по умолчанию вне цикла, существующие при добавлении колонки — в цикле.
ALTER TABLE members ADD COLUMN IF NOT EXISTS in_prayer_cycle BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE members ALTER COLUMN in_prayer_cycle SET DEFAULT FALSE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT FALSE;

-- Одноразово: меняем местами имя и фамилию (значения в first_name и last_name), пересобираем name.
CREATE TABLE IF NOT EXISTS app_data_patches (
  patch_id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $swap_member_name_columns$
BEGIN
  IF EXISTS (
    SELECT 1 FROM app_data_patches WHERE patch_id = 'members_fix_first_last_columns_2026_04_06'
  ) THEN
    RETURN;
  END IF;

  UPDATE members m SET
    first_name = m.last_name,
    last_name = m.first_name,
    name = TRIM(
      REGEXP_REPLACE(
        CONCAT_WS(
          ' ',
          NULLIF(TRIM(m.last_name), ''),
          NULLIF(TRIM(m.first_name), '')
        ),
        '[[:space:]]+',
        ' ',
        'g'
      )
    )
  WHERE NULLIF(TRIM(COALESCE(m.first_name, '')), '') IS NOT NULL
     OR NULLIF(TRIM(COALESCE(m.last_name, '')), '') IS NOT NULL;

  INSERT INTO app_data_patches (patch_id) VALUES ('members_fix_first_last_columns_2026_04_06');
END;
$swap_member_name_columns$;

ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS rutube_embed_code TEXT;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_prayer_chat_id TEXT;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_coordinator_chat_id TEXT;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_default_chat_id TEXT;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_prayer_template TEXT;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_dispatch_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_dispatch_kind VARCHAR(16) NOT NULL DEFAULT 'daily';
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_dispatch_time VARCHAR(5);
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_dispatch_once_at TIMESTAMPTZ;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_dispatch_target VARCHAR(16) NOT NULL DEFAULT 'all';
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_dispatch_member_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_dispatch_last_sent_at TIMESTAMPTZ;
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS notification_settings_json TEXT;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS source_service_plan_id BIGINT;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'youtube';
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS stream_url TEXT;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS notify_members BOOLEAN DEFAULT TRUE;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'scheduled';
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcasts_source_service_plan_id
  ON broadcasts (source_service_plan_id)
  WHERE source_service_plan_id IS NOT NULL;

ALTER TABLE church_events ADD COLUMN IF NOT EXISTS recurrence_type VARCHAR(16);
UPDATE church_events
SET recurrence_type = 'once'
WHERE recurrence_type IS NULL OR recurrence_type NOT IN ('once', 'weekly');
ALTER TABLE church_events ALTER COLUMN recurrence_type SET DEFAULT 'once';
ALTER TABLE church_events ALTER COLUMN recurrence_type SET NOT NULL;
ALTER TABLE church_events DROP CONSTRAINT IF EXISTS church_events_recurrence_type_check;
ALTER TABLE church_events ADD CONSTRAINT church_events_recurrence_type_check
  CHECK (recurrence_type IN ('once', 'weekly'));

ALTER TABLE church_events ADD COLUMN IF NOT EXISTS weekly_day SMALLINT;
ALTER TABLE church_events DROP CONSTRAINT IF EXISTS church_events_weekly_day_check;
ALTER TABLE church_events ADD CONSTRAINT church_events_weekly_day_check
  CHECK (weekly_day IS NULL OR (weekly_day BETWEEN 0 AND 6));

-- Сторонние схемы (Supabase и др.): свой CHECK по category несовместим с id из API (service, worship, …).
ALTER TABLE church_events DROP CONSTRAINT IF EXISTS church_events_category_check;

-- Постер события (картинка для дашборда).
ALTER TABLE church_events ADD COLUMN IF NOT EXISTS poster_url TEXT;

CREATE TABLE IF NOT EXISTS cycle_collection_claims (
  cycle_index INTEGER NOT NULL,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  claimed_by_member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  week_start_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cycle_index, member_id)
);

ALTER TABLE cycle_collection_claims DROP CONSTRAINT IF EXISTS cycle_collection_claims_member_id_fkey;
ALTER TABLE cycle_collection_claims ADD CONSTRAINT cycle_collection_claims_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;

ALTER TABLE cycle_collection_claims DROP CONSTRAINT IF EXISTS cycle_collection_claims_claimed_by_member_id_fkey;
ALTER TABLE cycle_collection_claims ADD CONSTRAINT cycle_collection_claims_claimed_by_member_id_fkey FOREIGN KEY (claimed_by_member_id) REFERENCES members(id) ON DELETE CASCADE;

-- Таблица могла быть создана раньше без week_start_date; IF NOT EXISTS в CREATE TABLE её не добавит.
ALTER TABLE cycle_collection_claims ADD COLUMN IF NOT EXISTS week_start_date DATE;

CREATE INDEX IF NOT EXISTS cycle_collection_claims_cycle_idx
  ON cycle_collection_claims (cycle_index);

CREATE INDEX IF NOT EXISTS cycle_collection_claims_claimer_idx
  ON cycle_collection_claims (claimed_by_member_id);

CREATE UNIQUE INDEX IF NOT EXISTS cycle_collection_claims_week_member_uidx
  ON cycle_collection_claims (week_start_date, member_id);

CREATE INDEX IF NOT EXISTS cycle_collection_claims_week_start_idx
  ON cycle_collection_claims (week_start_date);

CREATE UNIQUE INDEX IF NOT EXISTS members_email_unique_idx
  ON members (LOWER(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS members_login_unique_idx
  ON members (LOWER(login))
  WHERE login IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS members_account_unique_idx
  ON members (account_provider, account_id)
  WHERE account_provider IS NOT NULL AND account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS auth_sessions_member_id_idx
  ON auth_sessions (member_id);

CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx
  ON auth_sessions (expires_at);

CREATE INDEX IF NOT EXISTS members_phone_digits_idx
  ON members ((regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g')));

CREATE INDEX IF NOT EXISTS access_requests_status_idx
  ON access_requests (status);

CREATE INDEX IF NOT EXISTS access_requests_phone_digits_idx
  ON access_requests (phone_digits);

CREATE INDEX IF NOT EXISTS access_requests_request_type_idx
  ON access_requests (request_type);

CREATE INDEX IF NOT EXISTS idx_member_cycle_overrides_member_id
  ON member_cycle_overrides (member_id);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_member_id
  ON push_subscriptions (member_id);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  fcm_token TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_member_id
  ON user_subscriptions (member_id);

-- Централизованный журнал приложения (админка -> раздел "Журнал")
CREATE TABLE IF NOT EXISTS app_logs (
  id BIGSERIAL PRIMARY KEY,
  level VARCHAR(16) NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  scope VARCHAR(64) NOT NULL,
  event VARCHAR(128) NOT NULL,
  message TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_method VARCHAR(12),
  request_path TEXT,
  status_code INTEGER,
  duration_ms INTEGER,
  user_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_logs_created_desc
  ON app_logs (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_level_created
  ON app_logs (level, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_scope_created
  ON app_logs (scope, created_at DESC, id DESC);


CREATE OR REPLACE FUNCTION resolve_prayer_cycle_roster_member_ids(p_cycle_index bigint)
RETURNS integer[]
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
  v_alpha integer[];
  v_custom integer[];
  v_out integer[];
  r int;
  k int;
BEGIN
  SELECT array_agg(sub.id ORDER BY sub.sn)
  INTO v_alpha
  FROM (
    SELECT
      m.id,
      ROW_NUMBER() OVER (
        ORDER BY
          LOWER(COALESCE(NULLIF(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1))) ASC,
          LOWER(COALESCE(NULLIF(trim(m.first_name), ''), m.name)) ASC,
          m.id ASC
      ) AS sn
    FROM members m
    WHERE m.is_active = TRUE AND m.in_prayer_cycle = TRUE
  ) sub;

  IF v_alpha IS NULL THEN
    RETURN ARRAY[]::integer[];
  END IF;

  SELECT cro.member_ids
  INTO v_custom
  FROM prayer_cycle_roster_custom_order cro
  WHERE cro.cycle_index = p_cycle_index;

  IF v_custom IS NULL OR cardinality(v_custom) = 0 THEN
    RETURN v_alpha;
  END IF;

  v_out := ARRAY[]::integer[];
  FOREACH r IN ARRAY v_custom LOOP
    IF r = ANY(v_alpha) AND NOT (r = ANY(v_out)) THEN
      v_out := v_out || r;
    END IF;
  END LOOP;
  FOREACH k IN ARRAY v_alpha LOOP
    IF NOT (k = ANY(v_out)) THEN
      v_out := v_out || k;
    END IF;
  END LOOP;
  RETURN v_out;
END;
$fn$;

-- RPC aligned with src/services/calendarService.ts (overrides + is_active + per-cycle prayer_request + custom roster order).
CREATE OR REPLACE FUNCTION get_daily_prayer(target_date date)
RETURNS json
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_start_date date;
  v_day_diff integer;
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

  v_day_diff := target_date - v_start_date;

  SELECT COUNT(*)::integer INTO v_total_members
  FROM members
  WHERE is_active = TRUE AND in_prayer_cycle = TRUE;

  IF v_total_members = 0 THEN
    RETURN json_build_object('date', target_date, 'member', NULL);
  END IF;

  v_cycle_index := FLOOR(v_day_diff::numeric / v_total_members)::bigint;
  v_index := ((v_day_diff % v_total_members) + v_total_members) % v_total_members;

  SELECT (jsonb_set(
    to_jsonb(m),
    '{prayer_request}',
    to_jsonb(COALESCE(mpc.prayer_request, m.prayer_request))
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
    to_jsonb(COALESCE(mpc.prayer_request, m.prayer_request))
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

CREATE OR REPLACE FUNCTION set_access_requests_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_access_requests_updated_at ON access_requests;

CREATE TRIGGER trg_access_requests_updated_at
BEFORE UPDATE ON access_requests
FOR EACH ROW
EXECUTE PROCEDURE set_access_requests_updated_at();

CREATE OR REPLACE FUNCTION reset_cycle_on_member_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
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
  insert into global_settings (id, start_date)
  values (1, current_date)
  on conflict (id) do nothing;

  select start_date
    into v_start_date
  from global_settings
  where id = 1;

  if TG_OP = 'INSERT' then
    if NEW.is_active is distinct from true or NEW.in_prayer_cycle is distinct from true then
      return null;
    end if;

    select count(*)::int
      into v_new_total
    from members
    where is_active = true and in_prayer_cycle = true;

    v_old_total := v_new_total - 1;
    if v_old_total <= 0 then
      update global_settings
      set start_date = v_today
      where id = 1;
      return null;
    end if;

    v_old_index := ((v_today - v_start_date) % v_old_total + v_old_total) % v_old_total;

    select m.id
      into v_old_member_id
    from members m
    where m.id <> NEW.id
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
      from members m
      where m.is_active = true and m.in_prayer_cycle = true
    ) ranked
    where ranked.id = v_old_member_id;

    if v_new_index is null then
      return null;
    end if;

    update global_settings
    set start_date = v_today - v_new_index
    where id = 1;
    return null;
  end if;

  if TG_OP = 'UPDATE' then
    -- Входит в молитвенный цикл (в т.ч. после повторной активации).
    if NEW.is_active is true
       and NEW.in_prayer_cycle is true
       and OLD.in_prayer_cycle is not true then
      select count(*)::int
        into v_new_total
      from members
      where is_active = true and in_prayer_cycle = true;

      v_old_total := v_new_total - 1;
      if v_old_total <= 0 then
        update global_settings
        set start_date = v_today
        where id = 1;
        return null;
      end if;

      v_old_index := ((v_today - v_start_date) % v_old_total + v_old_total) % v_old_total;

      select m.id
        into v_old_member_id
      from members m
      where m.id <> NEW.id
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
        from members m
        where m.is_active = true and m.in_prayer_cycle = true
      ) ranked
      where ranked.id = v_old_member_id;

      if v_new_index is null then
        return null;
      end if;

      update global_settings
      set start_date = v_today - v_new_index
      where id = 1;
      return null;
    end if;

    -- Выходит из цикла (флаг): старая очередь с учётом того, что у строки ещё был active + in_cycle.
    if OLD.in_prayer_cycle is true and NEW.in_prayer_cycle is not true and OLD.is_active is true then
      select count(*)::int
        into v_new_total
      from members
      where is_active = true and in_prayer_cycle = true;

      if v_new_total <= 0 then
        update global_settings
        set start_date = v_today
        where id = 1;
        return null;
      end if;

      v_old_total := v_new_total + 1;
      v_old_index := ((v_today - v_start_date) % v_old_total + v_old_total) % v_old_total;

      select m.id
        into v_old_member_id
      from members m
      where (
          (m.id = NEW.id and OLD.in_prayer_cycle is true and OLD.is_active is true)
          or (m.id <> NEW.id and m.is_active is true and m.in_prayer_cycle is true)
        )
      order by
        case when m.id = NEW.id then
          lower(coalesce(nullif(trim(OLD.last_name), ''), split_part(trim(OLD.name), ' ', 1)))
        else
          lower(coalesce(nullif(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1)))
        end asc,
        case when m.id = NEW.id then
          lower(coalesce(nullif(trim(OLD.first_name), ''), OLD.name))
        else
          lower(coalesce(nullif(trim(m.first_name), ''), m.name))
        end asc,
        m.id asc
      limit 1 offset v_old_index;

      if v_old_member_id is null then
        return null;
      end if;

      if v_old_member_id = NEW.id then
        v_pick_index := (v_old_index + 1) % v_old_total;
        select m.id
          into v_target_member_id
        from members m
        where (
            (m.id = NEW.id and OLD.in_prayer_cycle is true and OLD.is_active is true)
            or (m.id <> NEW.id and m.is_active is true and m.in_prayer_cycle is true)
          )
        order by
          case when m.id = NEW.id then
            lower(coalesce(nullif(trim(OLD.last_name), ''), split_part(trim(OLD.name), ' ', 1)))
          else
            lower(coalesce(nullif(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1)))
          end asc,
          case when m.id = NEW.id then
            lower(coalesce(nullif(trim(OLD.first_name), ''), OLD.name))
          else
            lower(coalesce(nullif(trim(m.first_name), ''), m.name))
          end asc,
          m.id asc
        limit 1 offset v_pick_index;
      else
        v_target_member_id := v_old_member_id;
      end if;

      if v_target_member_id is null then
        update global_settings
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
        from members m
        where m.is_active = true and m.in_prayer_cycle = true
      ) ranked
      where ranked.id = v_target_member_id;

      if v_new_index is null then
        update global_settings
        set start_date = v_today
        where id = 1;
        return null;
      end if;

      update global_settings
      set start_date = v_today - v_new_index
      where id = 1;
      return null;
    end if;

    -- Деактивация, но флаг «в цикле» остался true — убираем из пула по факту как выше.
    if OLD.is_active is true
       and NEW.is_active is not true
       and OLD.in_prayer_cycle is true
       and NEW.in_prayer_cycle is true then
      select count(*)::int
        into v_new_total
      from members
      where is_active = true and in_prayer_cycle = true;

      if v_new_total <= 0 then
        update global_settings
        set start_date = v_today
        where id = 1;
        return null;
      end if;

      v_old_total := v_new_total + 1;
      v_old_index := ((v_today - v_start_date) % v_old_total + v_old_total) % v_old_total;

      select m.id
        into v_old_member_id
      from members m
      where (
          (m.id = NEW.id and OLD.in_prayer_cycle is true and OLD.is_active is true)
          or (m.id <> NEW.id and m.is_active is true and m.in_prayer_cycle is true)
        )
      order by
        case when m.id = NEW.id then
          lower(coalesce(nullif(trim(OLD.last_name), ''), split_part(trim(OLD.name), ' ', 1)))
        else
          lower(coalesce(nullif(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1)))
        end asc,
        case when m.id = NEW.id then
          lower(coalesce(nullif(trim(OLD.first_name), ''), OLD.name))
        else
          lower(coalesce(nullif(trim(m.first_name), ''), m.name))
        end asc,
        m.id asc
      limit 1 offset v_old_index;

      if v_old_member_id is null then
        return null;
      end if;

      if v_old_member_id = NEW.id then
        v_pick_index := (v_old_index + 1) % v_old_total;
        select m.id
          into v_target_member_id
        from members m
        where (
            (m.id = NEW.id and OLD.in_prayer_cycle is true and OLD.is_active is true)
            or (m.id <> NEW.id and m.is_active is true and m.in_prayer_cycle is true)
          )
        order by
          case when m.id = NEW.id then
            lower(coalesce(nullif(trim(OLD.last_name), ''), split_part(trim(OLD.name), ' ', 1)))
          else
            lower(coalesce(nullif(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1)))
          end asc,
          case when m.id = NEW.id then
            lower(coalesce(nullif(trim(OLD.first_name), ''), OLD.name))
          else
            lower(coalesce(nullif(trim(m.first_name), ''), m.name))
          end asc,
          m.id asc
        limit 1 offset v_pick_index;
      else
        v_target_member_id := v_old_member_id;
      end if;

      if v_target_member_id is null then
        update global_settings
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
        from members m
        where m.is_active = true and m.in_prayer_cycle = true
      ) ranked
      where ranked.id = v_target_member_id;

      if v_new_index is null then
        update global_settings
        set start_date = v_today
        where id = 1;
        return null;
      end if;

      update global_settings
      set start_date = v_today - v_new_index
      where id = 1;
      return null;
    end if;

    -- Смена ФИО у активного участника цикла: порядок в списке мог измениться, якорь подстраиваем.
    if NEW.is_active is true
       and OLD.is_active is true
       and NEW.in_prayer_cycle is true
       and OLD.in_prayer_cycle is true
       and (
         OLD.first_name is distinct from NEW.first_name
         or OLD.last_name is distinct from NEW.last_name
         or OLD.name is distinct from NEW.name
       ) then
      select count(*)::int
        into v_new_total
      from members
      where is_active = true and in_prayer_cycle = true;

      if v_new_total <= 0 then
        return null;
      end if;

      v_old_index := ((v_today - v_start_date) % v_new_total + v_new_total) % v_new_total;

      select m.id
        into v_old_member_id
      from members m
      where m.is_active = true and m.in_prayer_cycle = true
      order by
        case when m.id = NEW.id then
          lower(coalesce(nullif(trim(OLD.last_name), ''), split_part(trim(OLD.name), ' ', 1)))
        else
          lower(coalesce(nullif(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1)))
        end asc,
        case when m.id = NEW.id then
          lower(coalesce(nullif(trim(OLD.first_name), ''), OLD.name))
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
        from members m
        where m.is_active = true and m.in_prayer_cycle = true
      ) ranked
      where ranked.id = v_old_member_id;

      if v_new_index is null then
        return null;
      end if;

      update global_settings
      set start_date = v_today - v_new_index
      where id = 1;
      return null;
    end if;

    return null;
  end if;

  if TG_OP = 'DELETE' then
    if OLD.is_active is distinct from true or OLD.in_prayer_cycle is distinct from true then
      return null;
    end if;

    select count(*)::int
      into v_new_total
    from members
    where is_active = true and in_prayer_cycle = true;

    if v_new_total <= 0 then
      update global_settings
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
      from members m
      where m.is_active = true and m.in_prayer_cycle = true
      union all
      select
        OLD.id,
        lower(coalesce(nullif(trim(OLD.last_name), ''), split_part(trim(OLD.name), ' ', 1))),
        lower(coalesce(nullif(trim(OLD.first_name), ''), OLD.name))
    )
    select r.id
      into v_old_member_id
    from roster r
    order by r.sort_ln asc, r.sort_fn asc, r.id asc
    limit 1 offset v_old_index;

    if v_old_member_id is null then
      return null;
    end if;

    if v_old_member_id = OLD.id then
      v_pick_index := (v_old_index + 1) % v_old_total;
      with roster as (
        select
          m.id,
          lower(coalesce(nullif(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1))) as sort_ln,
          lower(coalesce(nullif(trim(m.first_name), ''), m.name)) as sort_fn
        from members m
        where m.is_active = true and m.in_prayer_cycle = true
        union all
        select
          OLD.id,
          lower(coalesce(nullif(trim(OLD.last_name), ''), split_part(trim(OLD.name), ' ', 1))),
          lower(coalesce(nullif(trim(OLD.first_name), ''), OLD.name))
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
      update global_settings
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
      from members m
      where m.is_active = true and m.in_prayer_cycle = true
    ) ranked
    where ranked.id = v_target_member_id;

    if v_new_index is null then
      update global_settings
      set start_date = v_today
      where id = 1;
      return null;
    end if;

    update global_settings
    set start_date = v_today - v_new_index
    where id = 1;
    return null;
  end if;

  return null;
end;
$$;

DROP TRIGGER IF EXISTS trg_reset_cycle_on_member_change ON members;

CREATE TRIGGER trg_reset_cycle_on_member_change
AFTER INSERT OR UPDATE OR DELETE ON members
FOR EACH ROW
EXECUTE PROCEDURE reset_cycle_on_member_change();


-- ═══════════════════════════════════════════════════════════════════
-- MESSENGER MODULE
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  type VARCHAR(16) NOT NULL DEFAULT 'private'
    CHECK (type IN ('personal', 'private', 'group', 'channel')),
  title VARCHAR(255),
  avatar_url TEXT,
  default_permissions JSONB NOT NULL DEFAULT jsonb_build_object(
    'can_send_messages', true,
    'can_send_media',    true,
    'can_add_users',     false,
    'can_pin_messages',  false,
    'can_manage_chat',   false
  ),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member')),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  muted_until TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, member_id)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_payload_type') THEN
    CREATE TYPE message_payload_type AS ENUM ('text', 'prayer_request', 'audio', 'image', 'file');
  END IF;
END $$;

-- Extend enum on older DBs (add values if missing)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_payload_type') THEN
    BEGIN
      ALTER TYPE message_payload_type ADD VALUE IF NOT EXISTS 'image';
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
    BEGIN
      ALTER TYPE message_payload_type ADD VALUE IF NOT EXISTS 'file';
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
    BEGIN
      ALTER TYPE message_payload_type ADD VALUE IF NOT EXISTS 'poll';
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
    BEGIN
      ALTER TYPE message_payload_type ADD VALUE IF NOT EXISTS 'access_request';
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  client_msg_id TEXT,
  content TEXT NOT NULL DEFAULT '',
  payload_type message_payload_type NOT NULL DEFAULT 'text',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  interaction_count INTEGER NOT NULL DEFAULT 0,
  reply_to_message_id BIGINT REFERENCES messages(id) ON DELETE SET NULL,
  forwarded_from JSONB,
  is_edited BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS read_receipts (
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  last_read_message_id BIGINT REFERENCES messages(id) ON DELETE SET NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, member_id)
);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  emoji VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, member_id, emoji)
);

CREATE TABLE IF NOT EXISTS message_poll_votes (
  message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  option_index SMALLINT NOT NULL CHECK (option_index >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, member_id, option_index)
);

CREATE INDEX IF NOT EXISTS idx_message_poll_votes_message
  ON message_poll_votes (message_id);

CREATE TABLE IF NOT EXISTS chat_pins (
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pinned_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
  PRIMARY KEY (conversation_id, message_id)
);

CREATE TABLE IF NOT EXISTS message_interactions (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type VARCHAR(32) NOT NULL DEFAULT 'pray_click',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, member_id)
);

-- Upgrades for DBs created before avatar_url
ALTER TABLE members ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Upgrades for older messenger DBs (columns added after initial rollout)
-- These are safe no-ops on fresh DBs, and prevent 42703 errors (missing columns) on old ones.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS default_permissions JSONB NOT NULL DEFAULT jsonb_build_object(
    'can_send_messages', true,
    'can_send_media',    true,
    'can_add_users',     false,
    'can_pin_messages',  false,
    'can_manage_chat',   false
  );
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Аватар группы/канала (старые БД без колонки в CREATE TABLE)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS avatar_url TEXT;

ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ;
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

-- Персональные настройки списка чатов (закрепление, папка «Личное/Служение», без звука через muted_until)
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS ui_pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS ui_pinned_at TIMESTAMPTZ;
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS ui_folder VARCHAR(16) NULL;

-- Upgrades for DBs created before read cursors
-- Старые БД: conversation_participants могли быть без last_read_message_id — индекс ниже тогда падает.
ALTER TABLE conversation_participants
  ADD COLUMN IF NOT EXISTS last_read_message_id BIGINT REFERENCES messages(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conv_participants_member
  ON conversation_participants (member_id) WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conv_participants_read_cursor
  ON conversation_participants (conversation_id, last_read_message_id);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conv_id_desc
  ON messages (conversation_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_messages_reply
  ON messages (reply_to_message_id) WHERE reply_to_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_read_receipts_member
  ON read_receipts (member_id);

CREATE INDEX IF NOT EXISTS idx_msg_reactions_message
  ON message_reactions (message_id);

CREATE INDEX IF NOT EXISTS idx_chat_pins_conv
  ON chat_pins (conversation_id, pinned_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_interactions_member
  ON message_interactions (member_id);

CREATE INDEX IF NOT EXISTS idx_message_interactions_message
  ON message_interactions (message_id);

CREATE INDEX IF NOT EXISTS idx_church_events_date_time
  ON church_events (event_date ASC, event_time ASC);

CREATE INDEX IF NOT EXISTS idx_conv_type
  ON conversations (type);

-- Upgrades for DBs created before metadata / payload / interactions
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_type_check;
-- Старые/битые значения type ломают CHECK при деплое
UPDATE conversations
SET type = 'private'
WHERE type IS NULL OR trim(type::text) NOT IN ('personal', 'private', 'group', 'channel');
UPDATE conversations SET type = 'private' WHERE type = 'personal';
ALTER TABLE conversations ADD CONSTRAINT conversations_type_check
  CHECK (type IN ('personal', 'private', 'group', 'channel'));
ALTER TABLE conversations ALTER COLUMN type SET DEFAULT 'private';

ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_msg_id TEXT;
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id BIGINT REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS interaction_count INTEGER NOT NULL DEFAULT 0;

-- Дубликаты (conversation_id, sender_id, client_msg_id) ломают UNIQUE INDEX ниже
UPDATE messages m
SET client_msg_id = NULL
WHERE m.client_msg_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM messages m2
    WHERE m2.conversation_id = m.conversation_id
      AND m2.sender_id IS NOT DISTINCT FROM m.sender_id
      AND m2.client_msg_id = m.client_msg_id
      AND m2.id < m.id
  );

-- Upgrades for DBs created before read_receipts.last_read_message_id (CREATE TABLE IF NOT EXISTS doesn't add columns)
ALTER TABLE read_receipts
  ADD COLUMN IF NOT EXISTS last_read_message_id BIGINT REFERENCES messages(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_dedupe
  ON messages (conversation_id, sender_id, client_msg_id)
  WHERE client_msg_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_payload_type') THEN
    CREATE TYPE message_payload_type AS ENUM ('text', 'prayer_request', 'audio');
  END IF;
END $$;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS payload_type message_payload_type NOT NULL DEFAULT 'text';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    JOIN pg_class t ON t.relname = c.table_name
    WHERE c.table_schema = 'public' AND c.table_name = 'messages' AND c.column_name = 'payload_type'
      AND c.data_type = 'text'
  ) THEN
    ALTER TABLE messages
    ALTER COLUMN payload_type DROP DEFAULT,
    ALTER COLUMN payload_type TYPE message_payload_type
    USING CASE trim(lower(payload_type::text))
      WHEN 'prayer_request' THEN 'prayer_request'::message_payload_type
      WHEN 'audio' THEN 'audio'::message_payload_type
      ELSE 'text'::message_payload_type
    END;
    ALTER TABLE messages ALTER COLUMN payload_type SET DEFAULT 'text'::message_payload_type;
    ALTER TABLE messages ALTER COLUMN payload_type SET NOT NULL;
  END IF;
END $$;

UPDATE messages m
SET payload = jsonb_build_object('text', m.content)
WHERE m.payload_type = 'text'
  AND (m.payload IS NULL OR m.payload = '{}'::jsonb);

-- Trigger: auto-update conversations.updated_at
CREATE OR REPLACE FUNCTION set_conversations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON conversations;
CREATE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON conversations FOR EACH ROW
EXECUTE PROCEDURE set_conversations_updated_at();

-- Trigger: auto-update messages.updated_at + is_edited on content change
CREATE OR REPLACE FUNCTION set_messages_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := NOW();
  IF OLD.content IS DISTINCT FROM NEW.content
     OR OLD.payload IS DISTINCT FROM NEW.payload THEN
    NEW.is_edited := TRUE;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_messages_updated_at ON messages;
CREATE TRIGGER trg_messages_updated_at
BEFORE UPDATE ON messages FOR EACH ROW
EXECUTE PROCEDURE set_messages_updated_at();

-- Trigger: bump conversation.updated_at on new message (for sidebar sorting)
CREATE OR REPLACE FUNCTION bump_conversation_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE conversations SET updated_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_bump_conversation_on_message ON messages;
CREATE TRIGGER trg_bump_conversation_on_message
AFTER INSERT ON messages FOR EACH ROW
EXECUTE PROCEDURE bump_conversation_on_message();

-- ═══════════════════════════════════════════════════════════════════
-- PROFILE SYSTEM (Instagram-style)
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_media_type') THEN
    CREATE TYPE profile_media_type AS ENUM ('image', 'video');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS user_profiles (
  member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  username VARCHAR(64) NOT NULL,
  display_name VARCHAR(120),
  bio TEXT,
  avatar_url TEXT,

  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  allow_comments VARCHAR(16) NOT NULL DEFAULT 'public'
    CHECK (allow_comments IN ('public', 'followers', 'private')),
  show_activity_status BOOLEAN NOT NULL DEFAULT TRUE,

  theme_mode VARCHAR(16) NOT NULL DEFAULT 'system'
    CHECK (theme_mode IN ('system', 'light', 'dark')),
  theme_accent_color VARCHAR(32),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_username_uidx
  ON user_profiles (LOWER(username));

CREATE TABLE IF NOT EXISTS profile_posts (
  id BIGSERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_posts_member_created
  ON profile_posts (member_id, created_at DESC);

ALTER TABLE profile_posts ADD COLUMN IF NOT EXISTS shared_post_id BIGINT REFERENCES profile_posts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_profile_posts_shared_post_id
  ON profile_posts (shared_post_id)
  WHERE shared_post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_profile_posts_one_repost_per_user_root
  ON profile_posts (member_id, shared_post_id)
  WHERE shared_post_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS profile_post_media (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES profile_posts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  type profile_media_type NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_profile_post_media_post
  ON profile_post_media (post_id);

CREATE TABLE IF NOT EXISTS profile_post_comments (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES profile_posts(id) ON DELETE CASCADE,
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_post_comments_post_created
  ON profile_post_comments (post_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_profile_post_comments_member
  ON profile_post_comments (member_id);

CREATE TABLE IF NOT EXISTS profile_post_likes (
  post_id BIGINT NOT NULL REFERENCES profile_posts(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_post_likes_post
  ON profile_post_likes (post_id);

-- Песенник и «Моя студия»
CREATE TABLE IF NOT EXISTS songs (
  id BIGSERIAL PRIMARY KEY,
  song_number INTEGER,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  default_key VARCHAR(32),
  tempo SMALLINT,
  time_signature VARCHAR(32),
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS songs_slug_uidx ON songs (LOWER(slug));
ALTER TABLE songs ADD COLUMN IF NOT EXISTS song_number INTEGER;
-- Нумерация только для NULL: номера max(existing)+1… без коллизий с уже занятыми song_number.
UPDATE songs AS s
SET song_number = base.mx + n.seq
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS seq
  FROM songs
  WHERE song_number IS NULL
) AS n
CROSS JOIN (
  SELECT COALESCE(
    (SELECT MAX(s2.song_number)::bigint FROM songs s2 WHERE s2.song_number IS NOT NULL),
    0::bigint
  ) AS mx
) AS base
WHERE s.id = n.id;
CREATE UNIQUE INDEX IF NOT EXISTS songs_song_number_uidx ON songs (song_number) WHERE song_number IS NOT NULL;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS songs_tags_gin ON songs USING GIN (tags);
CREATE INDEX IF NOT EXISTS songs_fts_idx ON songs USING GIN (
  to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
);

CREATE TABLE IF NOT EXISTS studio_versions (
  id BIGSERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  song_id BIGINT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  custom_content TEXT,
  custom_key VARCHAR(32),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_id, song_id)
);
CREATE INDEX IF NOT EXISTS idx_studio_versions_member ON studio_versions (member_id);
CREATE INDEX IF NOT EXISTS idx_studio_versions_song ON studio_versions (song_id);

CREATE TABLE IF NOT EXISTS studio_drafts (
  id BIGSERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_studio_drafts_member ON studio_drafts (member_id);

CREATE TABLE IF NOT EXISTS studio_instrument_settings (
  member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS song_favorites (
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  song_id BIGINT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (member_id, song_id)
);
CREATE INDEX IF NOT EXISTS idx_song_favorites_song ON song_favorites (song_id);

CREATE TABLE IF NOT EXISTS setlists (
  id BIGSERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  event_date DATE,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  share_token UUID UNIQUE DEFAULT gen_random_uuid(),
  share_token_issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE setlists ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE setlists ADD COLUMN IF NOT EXISTS share_token UUID UNIQUE DEFAULT gen_random_uuid();
UPDATE setlists SET share_token = gen_random_uuid() WHERE share_token IS NULL;
-- SECURITY FIX: срок жизни публичной ссылки сетлиста считаем от момента выдачи токена.
ALTER TABLE setlists ADD COLUMN IF NOT EXISTS share_token_issued_at TIMESTAMPTZ;
UPDATE setlists SET share_token_issued_at = COALESCE(share_token_issued_at, created_at, NOW());
ALTER TABLE setlists ALTER COLUMN share_token_issued_at SET DEFAULT NOW();
ALTER TABLE setlists ALTER COLUMN share_token_issued_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_setlists_member ON setlists (member_id);

CREATE TABLE IF NOT EXISTS setlist_items (
  id BIGSERIAL PRIMARY KEY,
  setlist_id BIGINT NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK ("position" >= 0),
  song_id BIGINT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  studio_version_id BIGINT REFERENCES studio_versions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (setlist_id, "position")
);
CREATE INDEX IF NOT EXISTS idx_setlist_items_setlist ON setlist_items (setlist_id, "position");
ALTER TABLE setlist_items ADD COLUMN IF NOT EXISTS musician_notes JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS studio_song_recents (
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  song_id BIGINT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  last_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (member_id, song_id)
);
CREATE INDEX IF NOT EXISTS idx_studio_song_recents_member ON studio_song_recents (member_id, last_opened_at DESC);

CREATE TABLE IF NOT EXISTS dashboard_coordinator_notes (
  kind VARCHAR(32) PRIMARY KEY CHECK (kind IN ('urgent_prayer', 'announcement')),
  body TEXT NOT NULL DEFAULT '',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  updated_by_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prayer_section_daily_visits (
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (member_id, visit_date)
);
CREATE INDEX IF NOT EXISTS idx_prayer_section_daily_visits_visit_date ON prayer_section_daily_visits (visit_date);

INSERT INTO songs (title, slug, content, default_key, tempo, time_signature, is_published)
SELECT 'Демо: пример песни', 'demo-primer-pesni',
       '{title: Пример}' || chr(10) || '[C]Строка с аккордами' || chr(10) || 'Текст куплета',
       'C', 72, '4/4', TRUE
WHERE NOT EXISTS (SELECT 1 FROM songs WHERE LOWER(slug) = LOWER('demo-primer-pesni'));

INSERT INTO ministry_role_templates (title)
VALUES
  ('Проповедник'),
  ('Ведущий'),
  ('Диакон'),
  ('Лидер Прославления'),
  ('Молодежный лидер'),
  ('Медиа менеджер')
ON CONFLICT (title) DO NOTHING;

-- Ensure every role is attached to every direction (if directions exist).
INSERT INTO ministry_direction_role_templates (direction_template_id, role_template_id)
SELECT d.id, r.id
FROM ministry_direction_templates d
CROSS JOIN ministry_role_templates r
ON CONFLICT (direction_template_id, role_template_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- ANALYTICS & STATISTICS
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analytics_sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pages_visited INTEGER NOT NULL DEFAULT 0,
  device_type VARCHAR(20),
  os VARCHAR(50),
  browser VARCHAR(50),
  ip_hash CHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_user
  ON analytics_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_last_active
  ON analytics_sessions (last_active_at DESC);

CREATE TABLE IF NOT EXISTS page_views (
  id BIGSERIAL PRIMARY KEY,
  page_key VARCHAR(100) NOT NULL,
  page_url TEXT,
  user_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  session_id VARCHAR(64),
  ip_hash CHAR(64),
  user_agent TEXT,
  device_type VARCHAR(20),
  os VARCHAR(50),
  browser VARCHAR(50),
  referrer TEXT,
  duration_seconds INTEGER,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_views_page_key
  ON page_views (page_key);
CREATE INDEX IF NOT EXISTS idx_page_views_user_id
  ON page_views (user_id);
CREATE INDEX IF NOT EXISTS idx_page_views_viewed_at
  ON page_views (viewed_at);
CREATE INDEX IF NOT EXISTS idx_page_views_page_user
  ON page_views (page_key, user_id);
CREATE INDEX IF NOT EXISTS idx_page_views_session
  ON page_views (session_id);
CREATE INDEX IF NOT EXISTS idx_page_views_page_viewed
  ON page_views (page_key, viewed_at DESC);

CREATE TABLE IF NOT EXISTS feature_events (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  page_key VARCHAR(100),
  user_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feature_events_type
  ON feature_events (event_type);
CREATE INDEX IF NOT EXISTS idx_feature_events_user
  ON feature_events (user_id);
CREATE INDEX IF NOT EXISTS idx_feature_events_created
  ON feature_events (created_at);

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics_page_daily_mv AS
SELECT
  date_trunc('day', pv.viewed_at) AS day,
  pv.page_key,
  COUNT(*)::bigint AS total_views,
  COUNT(DISTINCT pv.user_id)::bigint AS unique_users,
  COUNT(DISTINCT COALESCE(pv.session_id, pv.user_id::text))::bigint AS unique_sessions,
  COALESCE(AVG(pv.duration_seconds)::numeric(12,2), 0::numeric) AS avg_duration_seconds
FROM page_views pv
GROUP BY 1, 2;

CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_page_daily_mv_day_page
  ON analytics_page_daily_mv (day, page_key);

CREATE INDEX IF NOT EXISTS idx_analytics_page_daily_mv_page_day
  ON analytics_page_daily_mv (page_key, day DESC);

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics_page_hourly_mv AS
SELECT
  pv.page_key,
  EXTRACT(DOW FROM pv.viewed_at)::int AS day_of_week,
  EXTRACT(HOUR FROM pv.viewed_at)::int AS hour,
  COUNT(*)::bigint AS views
FROM page_views pv
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_page_hourly_mv_key
  ON analytics_page_hourly_mv (page_key, day_of_week, hour);
`;

export async function initDb(): Promise<void> {
  if (!pool) {
    throw new Error('Database pool is not initialized. Set DATABASE_URL in .env');
  }
  await pool.query(INIT_SQL);
  await pool.query(MEMBER_SEED_SQL);
  await mergeDuplicateMembersBootPatchIfNeeded();
}
