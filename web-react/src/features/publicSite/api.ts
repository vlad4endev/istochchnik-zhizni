import axios from 'axios';

import { resolveAxiosBaseURL } from '../../lib/config';
import type {
  SiteBroadcast,
  SiteEvent,
  SiteGalleryAlbum,
  SiteGalleryPhoto,
  SiteOverview,
  SiteSettings,
} from './types';

/** Публичные запросы без auth-interceptors (сайт открыт без входа). */
const publicClient = axios.create({
  timeout: 20000,
});

publicClient.interceptors.request.use((config) => {
  config.baseURL = resolveAxiosBaseURL();
  return config;
});

const BASE = '/api/site';

export async function fetchPublicSiteOverview(): Promise<SiteOverview> {
  const { data } = await publicClient.get<SiteOverview>(`${BASE}/public/overview`);
  return data;
}

export async function fetchPublicSiteSettings(): Promise<SiteSettings> {
  const { data } = await publicClient.get<{ settings: SiteSettings }>(`${BASE}/public/settings`);
  return data.settings;
}

export async function fetchPublicSiteEvents(): Promise<SiteEvent[]> {
  const { data } = await publicClient.get<{ events: SiteEvent[] }>(`${BASE}/public/events`);
  return Array.isArray(data.events) ? data.events : [];
}

export async function fetchPublicSiteBroadcast(): Promise<SiteBroadcast | null> {
  const { data } = await publicClient.get<{ broadcast: SiteBroadcast | null }>(
    `${BASE}/public/broadcast`,
  );
  return data.broadcast ?? null;
}

export async function fetchPublicSiteGallery(): Promise<SiteGalleryAlbum[]> {
  const { data } = await publicClient.get<{ albums: SiteGalleryAlbum[] }>(`${BASE}/public/gallery`);
  return Array.isArray(data.albums) ? data.albums : [];
}

export async function fetchPublicSiteAlbum(
  albumId: number,
): Promise<{ album: SiteGalleryAlbum; photos: SiteGalleryPhoto[] }> {
  const { data } = await publicClient.get<{ album: SiteGalleryAlbum; photos: SiteGalleryPhoto[] }>(
    `${BASE}/public/gallery/${albumId}`,
  );
  return data;
}
