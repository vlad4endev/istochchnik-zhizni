import path from 'node:path';
import type { Request, Response } from 'express';

import {
  addGalleryPhoto,
  createGalleryAlbum,
  deleteGalleryAlbum,
  deleteGalleryPhoto,
  getGalleryAlbum,
  getPublicSiteBroadcast,
  getPublicSiteOverview,
  getSiteSettings,
  listGalleryAlbums,
  listGalleryPhotos,
  listPublicSiteEvents,
  updateGalleryAlbum,
  updateSiteSettings,
} from '../services/siteContentService';
import {
  buildUserMediaSiteGalleryPath,
  getSupabaseStorageMissingEnv,
  isSupabaseStorageConfigured,
  uploadBufferToPublicBucket,
  userMediaBucket,
} from '../lib/supabaseStorage';

function parseId(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function getPublicSiteOverviewHandler(_req: Request, res: Response): Promise<void> {
  try {
    const data = await getPublicSiteOverview();
    res.json(data);
  } catch (err) {
    console.error('getPublicSiteOverview error', err);
    res.status(500).json({ error: 'Не удалось загрузить данные сайта' });
  }
}

export async function getPublicSiteSettingsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const settings = await getSiteSettings();
    res.json({ settings });
  } catch (err) {
    console.error('getPublicSiteSettings error', err);
    res.status(500).json({ error: 'Не удалось загрузить настройки сайта' });
  }
}

export async function getPublicSiteEventsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const events = await listPublicSiteEvents();
    res.json({ events });
  } catch (err) {
    console.error('getPublicSiteEvents error', err);
    res.status(500).json({ error: 'Не удалось загрузить события' });
  }
}

export async function getPublicSiteBroadcastHandler(_req: Request, res: Response): Promise<void> {
  try {
    const broadcast = await getPublicSiteBroadcast();
    res.json({ broadcast });
  } catch (err) {
    console.error('getPublicSiteBroadcast error', err);
    res.status(500).json({ error: 'Не удалось загрузить трансляцию' });
  }
}

export async function getPublicSiteGalleryHandler(_req: Request, res: Response): Promise<void> {
  try {
    const settings = await getSiteSettings();
    if (!settings.show_gallery) {
      res.json({ albums: [] });
      return;
    }
    const albums = await listGalleryAlbums({ publishedOnly: true });
    res.json({ albums });
  } catch (err) {
    console.error('getPublicSiteGallery error', err);
    res.status(500).json({ error: 'Не удалось загрузить галерею' });
  }
}

export async function getPublicSiteAlbumHandler(req: Request, res: Response): Promise<void> {
  try {
    const settings = await getSiteSettings();
    if (!settings.show_gallery) {
      res.status(404).json({ error: 'Галерея отключена' });
      return;
    }
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Некорректный id альбома' });
      return;
    }
    const album = await getGalleryAlbum(id, { publishedOnly: true });
    if (!album) {
      res.status(404).json({ error: 'Альбом не найден' });
      return;
    }
    const photos = await listGalleryPhotos(id);
    res.json({ album, photos });
  } catch (err) {
    console.error('getPublicSiteAlbum error', err);
    res.status(500).json({ error: 'Не удалось загрузить альбом' });
  }
}

export async function getAdminSiteSettingsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const settings = await getSiteSettings();
    res.json({ settings });
  } catch (err) {
    console.error('getAdminSiteSettings error', err);
    res.status(500).json({ error: 'Не удалось загрузить настройки сайта' });
  }
}

export async function patchAdminSiteSettingsHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const settings = await updateSiteSettings({
      church_name: typeof body.church_name === 'string' ? body.church_name : undefined,
      tagline: typeof body.tagline === 'string' ? body.tagline : undefined,
      about_text: typeof body.about_text === 'string' ? body.about_text : undefined,
      contact_text: typeof body.contact_text === 'string' ? body.contact_text : undefined,
      show_events: typeof body.show_events === 'boolean' ? body.show_events : undefined,
      show_live: typeof body.show_live === 'boolean' ? body.show_live : undefined,
      show_gallery: typeof body.show_gallery === 'boolean' ? body.show_gallery : undefined,
    });
    res.json({ settings });
  } catch (err) {
    console.error('patchAdminSiteSettings error', err);
    res.status(500).json({ error: 'Не удалось сохранить настройки сайта' });
  }
}

export async function listAdminGalleryAlbumsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const albums = await listGalleryAlbums();
    res.json({ albums });
  } catch (err) {
    console.error('listAdminGalleryAlbums error', err);
    res.status(500).json({ error: 'Не удалось загрузить альбомы' });
  }
}

export async function getAdminGalleryAlbumHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Некорректный id альбома' });
      return;
    }
    const album = await getGalleryAlbum(id);
    if (!album) {
      res.status(404).json({ error: 'Альбом не найден' });
      return;
    }
    const photos = await listGalleryPhotos(id);
    res.json({ album, photos });
  } catch (err) {
    console.error('getAdminGalleryAlbum error', err);
    res.status(500).json({ error: 'Не удалось загрузить альбом' });
  }
}

export async function createAdminGalleryAlbumHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const title = typeof body.title === 'string' ? body.title : '';
    if (!title.trim()) {
      res.status(400).json({ error: 'Укажите название альбома' });
      return;
    }
    const album = await createGalleryAlbum({
      title,
      description: typeof body.description === 'string' ? body.description : null,
      cover_url: typeof body.cover_url === 'string' ? body.cover_url : null,
      sort_order: typeof body.sort_order === 'number' ? body.sort_order : 0,
      is_published: typeof body.is_published === 'boolean' ? body.is_published : true,
    });
    res.status(201).json({ album });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ошибка создания альбома';
    console.error('createAdminGalleryAlbum error', err);
    res.status(400).json({ error: msg });
  }
}

export async function patchAdminGalleryAlbumHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Некорректный id альбома' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const album = await updateGalleryAlbum(id, {
      title: typeof body.title === 'string' ? body.title : undefined,
      description:
        body.description === null
          ? null
          : typeof body.description === 'string'
            ? body.description
            : undefined,
      cover_url:
        body.cover_url === null
          ? null
          : typeof body.cover_url === 'string'
            ? body.cover_url
            : undefined,
      sort_order: typeof body.sort_order === 'number' ? body.sort_order : undefined,
      is_published: typeof body.is_published === 'boolean' ? body.is_published : undefined,
    });
    if (!album) {
      res.status(404).json({ error: 'Альбом не найден' });
      return;
    }
    res.json({ album });
  } catch (err) {
    console.error('patchAdminGalleryAlbum error', err);
    res.status(500).json({ error: 'Не удалось обновить альбом' });
  }
}

export async function deleteAdminGalleryAlbumHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Некорректный id альбома' });
      return;
    }
    const ok = await deleteGalleryAlbum(id);
    if (!ok) {
      res.status(404).json({ error: 'Альбом не найден' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error('deleteAdminGalleryAlbum error', err);
    res.status(500).json({ error: 'Не удалось удалить альбом' });
  }
}

export async function createAdminGalleryPhotoHandler(req: Request, res: Response): Promise<void> {
  try {
    const albumId = parseId(req.params.id);
    if (!albumId) {
      res.status(400).json({ error: 'Некорректный id альбома' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const imageUrl = typeof body.image_url === 'string' ? body.image_url : '';
    if (!imageUrl.trim()) {
      res.status(400).json({ error: 'Укажите image_url' });
      return;
    }
    const photo = await addGalleryPhoto({
      album_id: albumId,
      image_url: imageUrl,
      caption: typeof body.caption === 'string' ? body.caption : null,
      sort_order: typeof body.sort_order === 'number' ? body.sort_order : 0,
    });
    res.status(201).json({ photo });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ошибка добавления фото';
    console.error('createAdminGalleryPhoto error', err);
    res.status(400).json({ error: msg });
  }
}

export async function deleteAdminGalleryPhotoHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Некорректный id фото' });
      return;
    }
    const ok = await deleteGalleryPhoto(id);
    if (!ok) {
      res.status(404).json({ error: 'Фото не найдено' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error('deleteAdminGalleryPhoto error', err);
    res.status(500).json({ error: 'Не удалось удалить фото' });
  }
}

export async function uploadAdminGalleryPhotoHandler(req: Request, res: Response): Promise<void> {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    res.status(400).json({ error: 'Файл обязателен' });
    return;
  }
  const buf = file.buffer;
  if (!buf || !buf.length) {
    res.status(400).json({ error: 'Файл пустой' });
    return;
  }
  if (!isSupabaseStorageConfigured()) {
    res.status(503).json({
      error: 'Хранилище файлов не настроено (нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY)',
      code: 'supabase_not_configured',
      missingEnv: getSupabaseStorageMissingEnv(),
    });
    return;
  }
  const ext = path.extname(file.originalname || '') || '';
  const safeExt = ext && ext.length <= 12 ? ext.toLowerCase() : '';
  const mimeType = String(file.mimetype || 'image/jpeg').toLowerCase();
  try {
    const objectPath = buildUserMediaSiteGalleryPath(safeExt);
    const { publicUrl } = await uploadBufferToPublicBucket({
      bucket: userMediaBucket(),
      objectPath,
      file: buf,
      contentType: mimeType,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { kind: 'site-gallery' },
    });
    res.json({ image_url: publicUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[site] gallery upload failed:', msg);
    res.status(502).json({ error: 'Не удалось сохранить файл в хранилище', code: 'storage_upload' });
  }
}
