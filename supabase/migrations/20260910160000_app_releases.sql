-- Android APK / app releases for home download widget and admin «Релизы»
CREATE TABLE IF NOT EXISTS app_releases (
  id BIGSERIAL PRIMARY KEY,
  version_name VARCHAR(64) NOT NULL DEFAULT '',
  version_code INTEGER,
  title VARCHAR(255) NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  download_url TEXT NOT NULL DEFAULT '',
  file_name VARCHAR(512),
  file_size_bytes BIGINT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_releases_active_created
  ON app_releases (is_active, created_at DESC);
