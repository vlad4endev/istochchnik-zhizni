import { Router } from 'express';

import {
  createAdminGalleryAlbumHandler,
  createAdminGalleryPhotoHandler,
  deleteAdminGalleryAlbumHandler,
  deleteAdminGalleryPhotoHandler,
  getAdminGalleryAlbumHandler,
  getAdminSiteSettingsHandler,
  getPublicSiteAlbumHandler,
  getPublicSiteBroadcastHandler,
  getPublicSiteEventsHandler,
  getPublicSiteGalleryHandler,
  getPublicSiteOverviewHandler,
  getPublicSiteSettingsHandler,
  listAdminGalleryAlbumsHandler,
  patchAdminGalleryAlbumHandler,
  patchAdminSiteSettingsHandler,
  uploadAdminGalleryPhotoHandler,
} from '../controllers/siteController';
import { requireAuthSession } from '../middleware/authSession';
import { requireAdmin } from '../middleware/requireAdmin';
import { eventPosterUploadMiddleware } from '../middleware/eventPosterUpload';
import { createIpRateLimiter } from '../middleware/rateLimit';

const router = Router();

const publicSiteRateLimit = createIpRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 240,
  message: 'Too many requests for public site. Please try again later.',
});

/** Публичные данные для сайта церкви (без авторизации). */
router.get('/public/overview', publicSiteRateLimit, getPublicSiteOverviewHandler);
router.get('/public/settings', publicSiteRateLimit, getPublicSiteSettingsHandler);
router.get('/public/events', publicSiteRateLimit, getPublicSiteEventsHandler);
router.get('/public/broadcast', publicSiteRateLimit, getPublicSiteBroadcastHandler);
router.get('/public/gallery', publicSiteRateLimit, getPublicSiteGalleryHandler);
router.get('/public/gallery/:id', publicSiteRateLimit, getPublicSiteAlbumHandler);

/** Мини-админка контента сайта. */
router.get('/settings', requireAuthSession, requireAdmin, getAdminSiteSettingsHandler);
router.patch('/settings', requireAuthSession, requireAdmin, patchAdminSiteSettingsHandler);

router.get('/gallery/albums', requireAuthSession, requireAdmin, listAdminGalleryAlbumsHandler);
router.post('/gallery/albums', requireAuthSession, requireAdmin, createAdminGalleryAlbumHandler);
router.get('/gallery/albums/:id', requireAuthSession, requireAdmin, getAdminGalleryAlbumHandler);
router.patch('/gallery/albums/:id', requireAuthSession, requireAdmin, patchAdminGalleryAlbumHandler);
router.delete('/gallery/albums/:id', requireAuthSession, requireAdmin, deleteAdminGalleryAlbumHandler);

router.post(
  '/gallery/albums/:id/photos',
  requireAuthSession,
  requireAdmin,
  createAdminGalleryPhotoHandler,
);
router.delete('/gallery/photos/:id', requireAuthSession, requireAdmin, deleteAdminGalleryPhotoHandler);
router.post(
  '/gallery/upload',
  requireAuthSession,
  requireAdmin,
  eventPosterUploadMiddleware,
  uploadAdminGalleryPhotoHandler,
);

export default router;
