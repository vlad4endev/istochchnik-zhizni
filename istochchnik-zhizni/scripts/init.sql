-- Инициализация таблиц (выполняется при отсутствии)

CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(120),
  last_name VARCHAR(120),
  name VARCHAR(255) NOT NULL,
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

ALTER TABLE members ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS first_name VARCHAR(120);
ALTER TABLE members ADD COLUMN IF NOT EXISTS last_name VARCHAR(120);
ALTER TABLE members ADD COLUMN IF NOT EXISTS phone_number VARCHAR(32);
ALTER TABLE members ADD COLUMN IF NOT EXISTS ministry_role VARCHAR(120);
ALTER TABLE members ADD COLUMN IF NOT EXISTS ministry_direction VARCHAR(120);
ALTER TABLE members ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE members ADD COLUMN IF NOT EXISTS account_provider VARCHAR(100);
ALTER TABLE members ADD COLUMN IF NOT EXISTS account_id VARCHAR(255);
ALTER TABLE members ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS app_role VARCHAR(16);
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

CREATE UNIQUE INDEX IF NOT EXISTS members_account_unique_idx
  ON members (account_provider, account_id)
  WHERE account_provider IS NOT NULL AND account_id IS NOT NULL;
