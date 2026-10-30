-- Публичный сайт церкви: настройки и фотогалерея.
CREATE TABLE IF NOT EXISTS site_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  church_name VARCHAR(255) NOT NULL DEFAULT 'Источник жизни',
  tagline TEXT NOT NULL DEFAULT '',
  about_text TEXT NOT NULL DEFAULT '',
  contact_text TEXT NOT NULL DEFAULT '',
  show_events BOOLEAN NOT NULL DEFAULT TRUE,
  show_live BOOLEAN NOT NULL DEFAULT TRUE,
  show_gallery BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO site_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS site_gallery_albums (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  cover_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_gallery_photos (
  id BIGSERIAL PRIMARY KEY,
  album_id BIGINT NOT NULL REFERENCES site_gallery_albums(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_gallery_albums_published_sort
  ON site_gallery_albums (is_published, sort_order ASC, id DESC);

CREATE INDEX IF NOT EXISTS idx_site_gallery_photos_album_sort
  ON site_gallery_photos (album_id, sort_order ASC, id DESC);
