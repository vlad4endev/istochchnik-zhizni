ALTER TABLE global_settings
ADD COLUMN IF NOT EXISTS sms_ru_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE global_settings
ADD COLUMN IF NOT EXISTS sms_ru_api_id TEXT;

ALTER TABLE global_settings
ADD COLUMN IF NOT EXISTS sms_ru_from TEXT;

ALTER TABLE global_settings
ADD COLUMN IF NOT EXISTS password_reset_code_secret TEXT;
