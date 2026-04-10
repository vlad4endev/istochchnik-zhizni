import { Router } from 'express';

import {
  draftsCreate,
  draftsDelete,
  draftsList,
  draftsUpdate,
  forkVersion,
  getMyVersions,
  getVersionForSong,
  instrumentsGet,
  instrumentsPatch,
  performanceGet,
  putVersion,
  recentSongsList,
  setlistItemsAdd,
  setlistItemsList,
  setlistItemsRemove,
  setlistItemsReorder,
  setlistsCreate,
  setlistsDelete,
  setlistsList,
  setlistsUpdate,
} from '../controllers/studioController';
import { requireAuthSession } from '../middleware/authSession';

const router = Router();

router.use(requireAuthSession);

router.get('/recent-songs', recentSongsList);
router.get('/versions', getMyVersions);
router.get('/versions/song/:songId', getVersionForSong);
router.put('/versions/:songId', putVersion);
router.post('/fork/:songId', forkVersion);

router.get('/drafts', draftsList);
router.post('/drafts', draftsCreate);
router.patch('/drafts/:id', draftsUpdate);
router.delete('/drafts/:id', draftsDelete);

router.get('/instruments', instrumentsGet);
router.patch('/instruments', instrumentsPatch);

router.get('/setlists', setlistsList);
router.post('/setlists', setlistsCreate);
router.patch('/setlists/:id', setlistsUpdate);
router.delete('/setlists/:id', setlistsDelete);
router.get('/setlists/:id/items', setlistItemsList);
router.post('/setlists/:id/items', setlistItemsAdd);
router.delete('/setlists/:id/items/:itemId', setlistItemsRemove);
router.post('/setlists/:id/reorder', setlistItemsReorder);
router.get('/setlists/:id/performance', performanceGet);

export default router;
