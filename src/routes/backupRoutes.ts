import { Router } from 'express';
import {
  createBackupHandler,
  deleteBackupHandler,
  disconnectDriveOAuthHandler,
  downloadBackupHandler,
  driveOAuthCallbackHandler,
  driveStatusHandler,
  getBackupDetailHandler,
  getBackupSettingsHandler,
  listBackupsHandler,
  listDriveBackupsHandler,
  patchBackupSettingsHandler,
  restoreBackupHandler,
  sendBackupDriveHandler,
  sendBackupTelegramHandler,
  startDriveOAuthHandler,
} from '../controllers/backupController';

const router = Router();

router.get('/settings', getBackupSettingsHandler);
router.patch('/settings', patchBackupSettingsHandler);
router.get('/list', listBackupsHandler);
router.post('/create', createBackupHandler);
router.get('/drive/status', driveStatusHandler);
router.get('/drive/list', listDriveBackupsHandler);
router.post('/drive/oauth/start', startDriveOAuthHandler);
router.get('/drive/oauth/callback', driveOAuthCallbackHandler);
router.post('/drive/oauth/disconnect', disconnectDriveOAuthHandler);
router.get('/:id/detail', getBackupDetailHandler);
router.get('/:id/download', downloadBackupHandler);
router.post('/:id/send-telegram', sendBackupTelegramHandler);
router.post('/:id/send-drive', sendBackupDriveHandler);
router.post('/:id/restore', restoreBackupHandler);
router.delete('/:id', deleteBackupHandler);

export default router;
