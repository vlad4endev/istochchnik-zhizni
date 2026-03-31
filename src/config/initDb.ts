import { pool } from './db';
import { MEMBER_SEED_SQL } from './memberSeedSql';

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
  rutube_embed_code TEXT
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

-- global_settings: строка (id=1) создаётся в ensurePrayerCycleAnchor() после initDb — не затирать якорь при обновлениях.

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

ALTER TABLE members ADD COLUMN IF NOT EXISTS is_collection_coordinator BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS rutube_embed_code TEXT;

CREATE TABLE IF NOT EXISTS cycle_collection_claims (
  cycle_index INTEGER NOT NULL,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  claimed_by_member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cycle_index, member_id)
);

ALTER TABLE cycle_collection_claims DROP CONSTRAINT IF EXISTS cycle_collection_claims_member_id_fkey;
ALTER TABLE cycle_collection_claims ADD CONSTRAINT cycle_collection_claims_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;

ALTER TABLE cycle_collection_claims DROP CONSTRAINT IF EXISTS cycle_collection_claims_claimed_by_member_id_fkey;
ALTER TABLE cycle_collection_claims ADD CONSTRAINT cycle_collection_claims_claimed_by_member_id_fkey FOREIGN KEY (claimed_by_member_id) REFERENCES members(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS cycle_collection_claims_cycle_idx
  ON cycle_collection_claims (cycle_index);

CREATE INDEX IF NOT EXISTS cycle_collection_claims_claimer_idx
  ON cycle_collection_claims (claimed_by_member_id);

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


-- RPC aligned with src/services/calendarService.ts (overrides + is_active + per-cycle prayer_request).
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
BEGIN
  INSERT INTO global_settings (id, start_date)
  VALUES (1, CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;

  SELECT start_date INTO v_start_date FROM global_settings WHERE id = 1;

  v_day_diff := target_date - v_start_date;

  SELECT COUNT(*)::integer INTO v_total_members
  FROM members
  WHERE is_active = TRUE;

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
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object('date', target_date, 'member', v_member_json);
  END IF;

  SELECT (jsonb_set(
    to_jsonb(m),
    '{prayer_request}',
    to_jsonb(COALESCE(mpc.prayer_request, m.prayer_request))
  ))::json
  INTO v_member_json
  FROM members m
  LEFT JOIN member_prayer_by_cycle mpc ON mpc.member_id = m.id AND mpc.cycle_index = v_cycle_index
  WHERE m.is_active = TRUE
  ORDER BY
    LOWER(COALESCE(NULLIF(trim(m.last_name), ''), split_part(trim(m.name), ' ', 1))) ASC,
    LOWER(COALESCE(NULLIF(trim(m.first_name), ''), m.name)) ASC,
    m.id ASC
  LIMIT 1 OFFSET v_index;

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

ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ;
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

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

CREATE INDEX IF NOT EXISTS idx_conv_type
  ON conversations (type);

-- Upgrades for DBs created before metadata / payload / interactions
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_type_check;
UPDATE conversations SET type = 'private' WHERE type = 'personal';
ALTER TABLE conversations ADD CONSTRAINT conversations_type_check
  CHECK (type IN ('personal', 'private', 'group', 'channel'));
ALTER TABLE conversations ALTER COLUMN type SET DEFAULT 'private';

ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_msg_id TEXT;
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id BIGINT REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS interaction_count INTEGER NOT NULL DEFAULT 0;

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
`;

export async function initDb(): Promise<void> {
  if (!pool) {
    throw new Error('Database pool is not initialized. Set DATABASE_URL in .env');
  }
  await pool.query(INIT_SQL);
  await pool.query(MEMBER_SEED_SQL);
}
