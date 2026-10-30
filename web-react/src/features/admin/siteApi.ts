import { apiClient } from '../../lib/apiClient';
import type { SiteGalleryAlbum, SiteGalleryPhoto, SiteSettings } from './siteTypes';

const BASE = '/api/site';

export async function fetchAdminSiteSettings(): Promise<SiteSettings> {
  const { data } = await apiClient.get<{ settings: SiteSettings }>(`${BASE}/settings`);
  return data.settings;
}

export async function patchAdminSiteSettings(
  body: Partial<SiteSettings>,
): Promise<SiteSettings> {
  const { data } = await apiClient.patch<{ settings: SiteSettings }>(`${BASE}/settings`, body);
  return data.settings;
}

export async function fetchAdminGalleryAlbums(): Promise<SiteGalleryAlbum[]> {
  const { data } = await apiClient.get<{ albums: SiteGalleryAlbum[] }>(`${BASE}/gallery/albums`);
  return Array.isArray(data.albums) ? data.albums : [];
}

export async function fetchAdminGalleryAlbum(
  id: number,
): Promise<{ album: SiteGalleryAlbum; photos: SiteGalleryPhoto[] }> {
  const { data } = await apiClient.get<{ album: SiteGalleryAlbum; photos: SiteGalleryPhoto[] }>(
    `${BASE}/gallery/albums/${id}`,
  );
  return data;
}

export async function createAdminGalleryAlbum(body: {
  title: string;
  description?: string;
  is_published?: boolean;
}): Promise<SiteGalleryAlbum> {
  const { data } = await apiClient.post<{ album: SiteGalleryAlbum }>(`${BASE}/gallery/albums`, body);
  return data.album;
}

export async function patchAdminGalleryAlbum(
  id: number,
  body: Partial<{
    title: string;
    description: string | null;
    cover_url: string | null;
    sort_order: number;
    is_published: boolean;
  }>,
): Promise<SiteGalleryAlbum> {
  const { data } = await apiClient.patch<{ album: SiteGalleryAlbum }>(
    `${BASE}/gallery/albums/${id}`,
    body,
  );
  return data.album;
}

export async function deleteAdminGalleryAlbum(id: number): Promise<void> {
  await apiClient.delete(`${BASE}/gallery/albums/${id}`, {
    validateStatus: (s) => s === 204 || (s != null && s < 500),
  });
}

export async function uploadAdminGalleryImage(file: File): Promise<{ image_url: string }> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await apiClient.post<{ image_url: string }>(`${BASE}/gallery/upload`, form);
  return data;
}

export async function addAdminGalleryPhoto(
  albumId: number,
  body: { image_url: string; caption?: string },
): Promise<SiteGalleryPhoto> {
  const { data } = await apiClient.post<{ photo: SiteGalleryPhoto }>(
    `${BASE}/gallery/albums/${albumId}/photos`,
    body,
  );
  return data.photo;
}

export async function deleteAdminGalleryPhoto(photoId: number): Promise<void> {
  await apiClient.delete(`${BASE}/gallery/photos/${photoId}`, {
    validateStatus: (s) => s === 204 || (s != null && s < 500),
  });
}
