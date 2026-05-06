import { Router } from 'express';

import { requireAuthSession } from '../middleware/authSession';
import {
  parseSongImportXlsx,
  previewSongImportXlsx,
  retryFailedSongImports,
  songImportProgressSse,
  songImportProgressSnapshot,
  songImportUploadXlsx,
  startSongImportXlsx,
} from '../controllers/songImportController';

const router = Router();

router.post('/preview', requireAuthSession, songImportUploadXlsx, previewSongImportXlsx);
router.post('/parse', requireAuthSession, songImportUploadXlsx, parseSongImportXlsx);
router.post('/start', requireAuthSession, songImportUploadXlsx, startSongImportXlsx);
router.get('/progress/:jobId', requireAuthSession, songImportProgressSse);
router.get('/snapshot/:jobId', requireAuthSession, songImportProgressSnapshot);
router.post('/retry-failed', requireAuthSession, retryFailedSongImports);

export default router;

