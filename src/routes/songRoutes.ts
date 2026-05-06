import { Router } from 'express';

import {
  addFavoriteHandler,
  aiSplitBlocksHandler,
  createSongHandler,
  deleteSongHandler,
  getSong,
  listSongs,
  listSongsForModeration,
  recordSongOpenedHandler,
  removeFavoriteHandler,
  updateSongHandler,
  versionFlags,
  youtubeOembed,
  importUrlText,
} from '../controllers/songController';
import { requireAuthSession } from '../middleware/authSession';

const router = Router();

router.get('/', listSongs);
router.get('/moderation', requireAuthSession, listSongsForModeration);
router.get('/youtube-oembed', requireAuthSession, youtubeOembed);
router.get('/import-url', requireAuthSession, importUrlText);
router.get('/version-flags', requireAuthSession, versionFlags);
router.post('/ai/split-blocks', requireAuthSession, aiSplitBlocksHandler);
router.post('/', requireAuthSession, createSongHandler);
router.post('/:id/open', requireAuthSession, recordSongOpenedHandler);
router.post('/:id/favorite', requireAuthSession, addFavoriteHandler);
router.delete('/:id/favorite', requireAuthSession, removeFavoriteHandler);
router.patch('/:id', requireAuthSession, updateSongHandler);
router.delete('/:id', requireAuthSession, deleteSongHandler);
router.get('/:id', getSong);

export default router;
