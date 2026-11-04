import { pool, query } from '../config/db';
import { listActiveEvents, type ChurchEvent } from './eventsService';
import { BROADCAST_STARTS_AT_SELECT } from '../utils/broadcastStartsAt';

let schemaReady = false;

export type SiteSettings = {
  church_name: string;
  tagline: string;
  about_text: string;
  contact_text: string;
  show_events: boolean;
  show_live: boolean;
  show_gallery: boolean;
  updated_at: string | null;
};

export type SiteGalleryAlbum = {
  id: number;
  title: string;
  description: string | null;
  cover_url: string | null;
  sort_order: number;
  is_published: boolean;
  photo_count: number;
  created_at: string;
  updated_at: string;
};

export type SiteGalleryPhoto = {
  id: number;
  album_id: number;
  image_url: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
};

export type PublicSiteBroadcast = {
  id: number;
  title: string | null;
  description: string | null;
  starts_at: string | null;
  platform: string;
  stream_url: string | null;
  status: string;
};

const DEFAULT_SETTINGS: SiteSettings = {
  church_name: 'Источник жизни',
  tagline: 'Добро пожаловать на сайт нашей церкви',
  about_text: '',
  contact_text: '',
  show_events: true,
  show_live: true,
  show_gallery: true,
  updated_at: null,
};

export async function ensureSiteContentSchema(): Promise<void> {
  if (schemaReady) return;
  if (!pool) {
    throw new Error('Database pool is not initialized');
  }

  await query(`
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
    )
  `);

  await query(`
    INSERT INTO site_settings (id)
    VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS site_gallery_albums (
      id BIGSERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      cover_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS site_gallery_photos (
      id BIGSERIAL PRIMARY KEY,
      album_id BIGINT NOT NULL REFERENCES site_gallery_albums(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      caption TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_site_gallery_albums_published_sort
      ON site_gallery_albums (is_published, sort_order ASC, id DESC)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_site_gallery_photos_album_sort
      ON site_gallery_photos (album_id, sort_order ASC, id DESC)
  `);

  schemaReady = true;
}

function mapSettings(row: Record<string, unknown> | undefined): SiteSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    church_name: String(row.church_name ?? DEFAULT_SETTINGS.church_name).trim() || DEFAULT_SETTINGS.church_name,
    tagline: String(row.tagline ?? ''),
    about_text: String(row.about_text ?? ''),
    contact_text: String(row.contact_text ?? ''),
    show_events: Boolean(row.show_events ?? true),
    show_live: Boolean(row.show_live ?? true),
    show_gallery: Boolean(row.show_gallery ?? true),
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at
          ? String(row.updated_at)
          : null,
  };
}

export async function getSiteSettings(): Promise<SiteSettings> {
  await ensureSiteContentSchema();
  const { rows } = await query(`SELECT * FROM site_settings WHERE id = 1 LIMIT 1`);
  return mapSettings(rows[0] as Record<string, unknown> | undefined);
}

export async function updateSiteSettings(
  patch: Partial<{
    church_name: string;
    tagline: string;
    about_text: string;
    contact_text: string;
    show_events: boolean;
    show_live: boolean;
    show_gallery: boolean;
  }>,
): Promise<SiteSettings> {
  await ensureSiteContentSchema();
  const current = await getSiteSettings();
  const next = {
    church_name:
      typeof patch.church_name === 'string' && patch.church_name.trim()
        ? patch.church_name.trim().slice(0, 255)
        : current.church_name,
    tagline: typeof patch.tagline === 'string' ? patch.tagline.slice(0, 2000) : current.tagline,
    about_text:
      typeof patch.about_text === 'string' ? patch.about_text.slice(0, 10000) : current.about_text,
    contact_text:
      typeof patch.contact_text === 'string' ? patch.contact_text.slice(0, 4000) : current.contact_text,
    show_events: typeof patch.show_events === 'boolean' ? patch.show_events : current.show_events,
    show_live: typeof patch.show_live === 'boolean' ? patch.show_live : current.show_live,
    show_gallery: typeof patch.show_gallery === 'boolean' ? patch.show_gallery : current.show_gallery,
  };

  const { rows } = await query(
    `UPDATE site_settings
        SET church_name = $1,
            tagline = $2,
            about_text = $3,
            contact_text = $4,
            show_events = $5,
            show_live = $6,
            show_gallery = $7,
            updated_at = NOW()
      WHERE id = 1
      RETURNING *`,
    [
      next.church_name,
      next.tagline,
      next.about_text,
      next.contact_text,
      next.show_events,
      next.show_live,
      next.show_gallery,
    ],
  );
  return mapSettings(rows[0] as Record<string, unknown>);
}

function mapAlbum(row: Record<string, unknown>): SiteGalleryAlbum {
  return {
    id: Number(row.id),
    title: String(row.title ?? '').trim(),
    description: row.description == null || row.description === '' ? null : String(row.description),
    cover_url: row.cover_url == null || row.cover_url === '' ? null : String(row.cover_url),
    sort_order: Number(row.sort_order ?? 0),
    is_published: Boolean(row.is_published),
    photo_count: Number(row.photo_count ?? 0),
    created_at:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ''),
    updated_at:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at ?? ''),
  };
}

function mapPhoto(row: Record<string, unknown>): SiteGalleryPhoto {
  return {
    id: Number(row.id),
    album_id: Number(row.album_id),
    image_url: String(row.image_url ?? ''),
    caption: row.caption == null || row.caption === '' ? null : String(row.caption),
    sort_order: Number(row.sort_order ?? 0),
    created_at:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ''),
  };
}

const ALBUM_SELECT = `
  SELECT a.id, a.title, a.description, a.cover_url, a.sort_order, a.is_published,
         a.created_at, a.updated_at,
         COALESCE((SELECT COUNT(*)::int FROM site_gallery_photos p WHERE p.album_id = a.id), 0) AS photo_count
    FROM site_gallery_albums a
`;

export async function listGalleryAlbums(opts?: {
  publishedOnly?: boolean;
}): Promise<SiteGalleryAlbum[]> {
  await ensureSiteContentSchema();
  const publishedOnly = opts?.publishedOnly === true;
  const { rows } = await query(
    `${ALBUM_SELECT}
      ${publishedOnly ? 'WHERE a.is_published = TRUE' : ''}
      ORDER BY a.sort_order ASC, a.id DESC`,
  );
  return (rows as Record<string, unknown>[]).map(mapAlbum);
}

export async function getGalleryAlbum(
  albumId: number,
  opts?: { publishedOnly?: boolean },
): Promise<SiteGalleryAlbum | null> {
  await ensureSiteContentSchema();
  const publishedOnly = opts?.publishedOnly === true;
  const { rows } = await query(
    `${ALBUM_SELECT}
      WHERE a.id = $1
        ${publishedOnly ? 'AND a.is_published = TRUE' : ''}
      LIMIT 1`,
    [albumId],
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? mapAlbum(row) : null;
}

export async function createGalleryAlbum(input: {
  title: string;
  description?: string | null;
  cover_url?: string | null;
  sort_order?: number;
  is_published?: boolean;
}): Promise<SiteGalleryAlbum> {
  await ensureSiteContentSchema();
  const title = input.title.trim().slice(0, 255);
  if (!title) {
    throw new Error('Название альбома обязательно');
  }
  const { rows } = await query(
    `INSERT INTO site_gallery_albums (title, description, cover_url, sort_order, is_published)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      title,
      input.description?.trim() || null,
      input.cover_url?.trim() || null,
      Number.isFinite(input.sort_order) ? Number(input.sort_order) : 0,
      input.is_published !== false,
    ],
  );
  const id = Number((rows[0] as { id: number }).id);
  const album = await getGalleryAlbum(id);
  if (!album) throw new Error('Album create failed');
  return album;
}

export async function updateGalleryAlbum(
  albumId: number,
  patch: Partial<{
    title: string;
    description: string | null;
    cover_url: string | null;
    sort_order: number;
    is_published: boolean;
  }>,
): Promise<SiteGalleryAlbum | null> {
  await ensureSiteContentSchema();
  const current = await getGalleryAlbum(albumId);
  if (!current) return null;

  const title =
    typeof patch.title === 'string' && patch.title.trim()
      ? patch.title.trim().slice(0, 255)
      : current.title;
  const description =
    patch.description === undefined
      ? current.description
      : patch.description?.trim()
        ? patch.description.trim().slice(0, 4000)
        : null;
  const cover_url =
    patch.cover_url === undefined
      ? current.cover_url
      : patch.cover_url?.trim()
        ? patch.cover_url.trim()
        : null;
  const sort_order =
    typeof patch.sort_order === 'number' && Number.isFinite(patch.sort_order)
      ? Math.trunc(patch.sort_order)
      : current.sort_order;
  const is_published =
    typeof patch.is_published === 'boolean' ? patch.is_published : current.is_published;

  await query(
    `UPDATE site_gallery_albums
        SET title = $2,
            description = $3,
            cover_url = $4,
            sort_order = $5,
            is_published = $6,
            updated_at = NOW()
      WHERE id = $1`,
    [albumId, title, description, cover_url, sort_order, is_published],
  );
  return getGalleryAlbum(albumId);
}

export async function deleteGalleryAlbum(albumId: number): Promise<boolean> {
  await ensureSiteContentSchema();
  const result = await query(`DELETE FROM site_gallery_albums WHERE id = $1`, [albumId]);
  return (result.rowCount ?? 0) > 0;
}

export async function listGalleryPhotos(albumId: number): Promise<SiteGalleryPhoto[]> {
  await ensureSiteContentSchema();
  const { rows } = await query(
    `SELECT id, album_id, image_url, caption, sort_order, created_at
       FROM site_gallery_photos
      WHERE album_id = $1
      ORDER BY sort_order ASC, id DESC`,
    [albumId],
  );
  return (rows as Record<string, unknown>[]).map(mapPhoto);
}

export async function addGalleryPhoto(input: {
  album_id: number;
  image_url: string;
  caption?: string | null;
  sort_order?: number;
}): Promise<SiteGalleryPhoto> {
  await ensureSiteContentSchema();
  const album = await getGalleryAlbum(input.album_id);
  if (!album) {
    throw new Error('Альбом не найден');
  }
  const imageUrl = input.image_url.trim();
  if (!imageUrl) {
    throw new Error('URL фотографии обязателен');
  }
  const { rows } = await query(
    `INSERT INTO site_gallery_photos (album_id, image_url, caption, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING id, album_id, image_url, caption, sort_order, created_at`,
    [
      input.album_id,
      imageUrl,
      input.caption?.trim() || null,
      Number.isFinite(input.sort_order) ? Number(input.sort_order) : 0,
    ],
  );

  // Если обложки нет — ставим первое фото.
  if (!album.cover_url) {
    await query(
      `UPDATE site_gallery_albums
          SET cover_url = $2, updated_at = NOW()
        WHERE id = $1 AND (cover_url IS NULL OR TRIM(cover_url) = '')`,
      [input.album_id, imageUrl],
    );
  } else {
    await query(`UPDATE site_gallery_albums SET updated_at = NOW() WHERE id = $1`, [input.album_id]);
  }

  return mapPhoto(rows[0] as Record<string, unknown>);
}

export async function deleteGalleryPhoto(photoId: number): Promise<boolean> {
  await ensureSiteContentSchema();
  const { rows } = await query(
    `DELETE FROM site_gallery_photos WHERE id = $1 RETURNING album_id`,
    [photoId],
  );
  if (!rows[0]) return false;
  const albumId = Number((rows[0] as { album_id: number }).album_id);
  await query(`UPDATE site_gallery_albums SET updated_at = NOW() WHERE id = $1`, [albumId]);
  return true;
}

export async function listPublicSiteEvents(): Promise<ChurchEvent[]> {
  const settings = await getSiteSettings();
  if (!settings.show_events) return [];
  return listActiveEvents();
}

async function ensureBroadcastsTableForSite(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS broadcasts (
      id BIGSERIAL PRIMARY KEY,
      title VARCHAR(255),
      description TEXT,
      starts_at TIMESTAMP,
      platform VARCHAR(20) NOT NULL DEFAULT 'youtube',
      stream_url TEXT,
      notify_members BOOLEAN NOT NULL DEFAULT TRUE,
      is_public BOOLEAN NOT NULL DEFAULT FALSE,
      status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE`);
}

export async function getPublicSiteBroadcast(): Promise<PublicSiteBroadcast | null> {
  const settings = await getSiteSettings();
  if (!settings.show_live) return null;
  if (!pool) return null;

  await ensureBroadcastsTableForSite();

  // Завершаем просроченные эфиры (как в broadcastController).
  await query(
    `UPDATE broadcasts
        SET status = 'finished', updated_at = NOW()
      WHERE status IN ('live', 'scheduled')
        AND starts_at IS NOT NULL
        AND starts_at + INTERVAL '2 hours' < NOW()`,
  );

  const { rows } = await query(
    `SELECT id, title, description, ${BROADCAST_STARTS_AT_SELECT}, platform, stream_url, status
       FROM broadcasts
      WHERE is_public = TRUE
        AND status IN ('live', 'scheduled')
        AND (status = 'live' OR starts_at IS NULL OR starts_at >= (NOW() - INTERVAL '6 hours'))
        AND stream_url IS NOT NULL
        AND TRIM(stream_url) <> ''
      ORDER BY CASE WHEN status = 'live' THEN 0 ELSE 1 END, starts_at ASC NULLS LAST, id DESC
      LIMIT 1`,
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: Number(row.id),
    title: row.title == null ? null : String(row.title),
    description: row.description == null ? null : String(row.description),
    starts_at: row.starts_at == null ? null : String(row.starts_at),
    platform: String(row.platform ?? 'youtube'),
    stream_url: row.stream_url == null ? null : String(row.stream_url),
    status: String(row.status ?? 'scheduled'),
  };
}

export async function getPublicSiteOverview(): Promise<{
  settings: SiteSettings;
  events: ChurchEvent[];
  broadcast: PublicSiteBroadcast | null;
  albums: SiteGalleryAlbum[];
}> {
  const settings = await getSiteSettings();
  const [events, broadcast, albums] = await Promise.all([
    settings.show_events ? listActiveEvents() : Promise.resolve([] as ChurchEvent[]),
    getPublicSiteBroadcast(),
    settings.show_gallery
      ? listGalleryAlbums({ publishedOnly: true })
      : Promise.resolve([] as SiteGalleryAlbum[]),
  ]);
  return {
    settings,
    events: events.slice(0, 12),
    broadcast,
    albums: albums.slice(0, 8),
  };
}
