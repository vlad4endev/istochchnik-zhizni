import { Router } from 'express';

import {
  addFavoriteHandler,
  createSongHandler,
  deleteSongHandler,
  getSong,
  listSongs,
  recordSongOpenedHandler,
  removeFavoriteHandler,
  updateSongHandler,
  versionFlags,
  youtubeOembed,
} from '../controllers/songController';
import { requireAuthSession } from '../middleware/authSession';

const router = Router();

router.get('/', listSongs);
router.get('/youtube-oembed', requireAuthSession, youtubeOembed);
router.get('/version-flags', requireAuthSession, versionFlags);
router.post('/', requireAuthSession, createSongHandler);
router.post('/:id/open', requireAuthSession, recordSongOpenedHandler);
router.post('/:id/favorite', requireAuthSession, addFavoriteHandler);
router.delete('/:id/favorite', requireAuthSession, removeFavoriteHandler);
router.patch('/:id', requireAuthSession, updateSongHandler);
router.delete('/:id', requireAuthSession, deleteSongHandler);
router.get('/:id', getSong);

export default router;
