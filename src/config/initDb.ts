import { pool } from './db';

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(120),
  last_name VARCHAR(120),
  name VARCHAR(255) NOT NULL,
  login VARCHAR(64),
  password_hash TEXT,
  phone_number VARCHAR(32),
  ministry_role VARCHAR(120),
  ministry_direction VARCHAR(120),
  prayer_request TEXT,
  birth_date DATE,
  email VARCHAR(255),
  account_provider VARCHAR(100),
  account_id VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  app_role VARCHAR(16) NOT NULL DEFAULT 'member' CHECK (app_role IN ('member', 'admin')),
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

CREATE TABLE IF NOT EXISTS global_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  start_date DATE NOT NULL
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  reviewed_by_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO global_settings (id, start_date)
VALUES (1, CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE members ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS first_name VARCHAR(120);
ALTER TABLE members ADD COLUMN IF NOT EXISTS last_name VARCHAR(120);
ALTER TABLE members ADD COLUMN IF NOT EXISTS login VARCHAR(64);
ALTER TABLE members ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS phone_number VARCHAR(32);
ALTER TABLE members ADD COLUMN IF NOT EXISTS ministry_role VARCHAR(120);
ALTER TABLE members ADD COLUMN IF NOT EXISTS ministry_direction VARCHAR(120);
ALTER TABLE members ADD COLUMN IF NOT EXISTS app_role VARCHAR(16) NOT NULL DEFAULT 'member';
ALTER TABLE members ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE members ADD COLUMN IF NOT EXISTS account_provider VARCHAR(100);
ALTER TABLE members ADD COLUMN IF NOT EXISTS account_id VARCHAR(255);
ALTER TABLE members ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE members
SET app_role = 'member'
WHERE app_role IS NULL OR app_role NOT IN ('member', 'admin');
ALTER TABLE members ALTER COLUMN app_role SET DEFAULT 'member';
ALTER TABLE members ALTER COLUMN app_role SET NOT NULL;
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_app_role_check;
ALTER TABLE members ADD CONSTRAINT members_app_role_check CHECK (app_role IN ('member', 'admin'));

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

CREATE INDEX IF NOT EXISTS idx_member_cycle_overrides_member_id
  ON member_cycle_overrides (member_id);

-- RPC aligned with src/services/calendarService.ts (overrides + is_active + sort order).
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
  v_member members%ROWTYPE;
BEGIN
  INSERT INTO global_settings (id, start_date)
  VALUES (1, CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;

  SELECT m.*
  INTO v_member
  FROM member_cycle_overrides o
  JOIN members m ON m.id = o.member_id
  WHERE o.target_date = target_date
    AND m.is_active = TRUE
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object('date', target_date, 'member', row_to_json(v_member));
  END IF;

  SELECT start_date INTO v_start_date FROM global_settings WHERE id = 1;

  v_day_diff := target_date - v_start_date;

  SELECT COUNT(*)::integer INTO v_total_members
  FROM members
  WHERE is_active = TRUE;

  IF v_total_members = 0 THEN
    RETURN json_build_object('date', target_date, 'member', NULL);
  END IF;

  v_index := ((v_day_diff % v_total_members) + v_total_members) % v_total_members;

  SELECT m.*
  INTO v_member
  FROM members m
  WHERE m.is_active = TRUE
  ORDER BY
    LOWER(COALESCE(NULLIF(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1))) ASC,
    LOWER(COALESCE(NULLIF(trim(m.first_name), ''), m.name)) ASC,
    m.id ASC
  LIMIT 1 OFFSET v_index;

  RETURN json_build_object('date', target_date, 'member', row_to_json(v_member));
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
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_start_date DATE;
  v_old_total INTEGER;
  v_new_total INTEGER;
  v_old_index INTEGER;
  v_old_member_id INTEGER;
  v_new_index INTEGER;
BEGIN
  INSERT INTO global_settings (id, start_date)
  VALUES (1, current_date)
  ON CONFLICT (id) DO NOTHING;

  SELECT start_date
    INTO v_start_date
  FROM global_settings
  WHERE id = 1;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_active IS DISTINCT FROM TRUE THEN
      RETURN NULL;
    END IF;

    SELECT COUNT(*)::int
      INTO v_new_total
    FROM members
    WHERE is_active = TRUE;

    v_old_total := v_new_total - 1;
    IF v_old_total <= 0 THEN
      UPDATE global_settings
      SET start_date = v_today
      WHERE id = 1;
      RETURN NULL;
    END IF;

    v_old_index := ((v_today - v_start_date) % v_old_total + v_old_total) % v_old_total;

    SELECT m.id
      INTO v_old_member_id
    FROM members m
    WHERE m.id <> NEW.id
      AND m.is_active = TRUE
    ORDER BY
      LOWER(COALESCE(NULLIF(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1))) ASC,
      LOWER(COALESCE(NULLIF(trim(m.first_name), ''), m.name)) ASC,
      m.id ASC
    LIMIT 1
    OFFSET v_old_index;

    IF v_old_member_id IS NULL THEN
      RETURN NULL;
    END IF;

    SELECT ranked.idx
      INTO v_new_index
    FROM (
      SELECT
        m.id,
        ROW_NUMBER() OVER (
          ORDER BY
            LOWER(COALESCE(NULLIF(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1))) ASC,
            LOWER(COALESCE(NULLIF(trim(m.first_name), ''), m.name)) ASC,
            m.id ASC
        ) - 1 AS idx
      FROM members m
      WHERE m.is_active = TRUE
    ) ranked
    WHERE ranked.id = v_old_member_id;

    IF v_new_index IS NULL THEN
      RETURN NULL;
    END IF;

    UPDATE global_settings
    SET start_date = v_today - v_new_index
    WHERE id = 1;
    RETURN NULL;
  END IF;

  IF OLD.is_active IS DISTINCT FROM TRUE THEN
    RETURN NULL;
  END IF;

  -- Deleting an active member intentionally restarts cycle from current day.
  UPDATE global_settings
  SET start_date = v_today
  WHERE id = 1;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_cycle_on_member_change ON members;

CREATE TRIGGER trg_reset_cycle_on_member_change
AFTER INSERT OR DELETE ON members
FOR EACH ROW
EXECUTE PROCEDURE reset_cycle_on_member_change();

INSERT INTO ministry_role_templates (title)
VALUES
  ('Проповедник'),
  ('Ведущий'),
  ('Диакон'),
  ('Лидер Прославления'),
  ('Молодежный лидер'),
  ('Медиа менеджер')
ON CONFLICT (title) DO NOTHING;
`;

export async function initDb(): Promise<void> {
  if (!pool) {
    throw new Error('Database pool is not initialized. Set DATABASE_URL in .env');
  }
  await pool.query(INIT_SQL);
}
