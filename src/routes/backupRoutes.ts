import { Router } from 'express';
import {
  createBackupHandler,
  deleteBackupHandler,
  downloadBackupHandler,
  driveStatusHandler,
  getBackupDetailHandler,
  getBackupSettingsHandler,
  listBackupsHandler,
  listDriveBackupsHandler,
  patchBackupSettingsHandler,
  restoreBackupHandler,
  sendBackupDriveHandler,
  sendBackupTelegramHandler,
} from '../controllers/backupController';

const router = Router();

router.get('/settings', getBackupSettingsHandler);
router.patch('/settings', patchBackupSettingsHandler);
router.get('/list', listBackupsHandler);
router.post('/create', createBackupHandler);
router.get('/drive/status', driveStatusHandler);
router.get('/drive/list', listDriveBackupsHandler);
router.get('/:id/detail', getBackupDetailHandler);
router.get('/:id/download', downloadBackupHandler);
router.post('/:id/send-telegram', sendBackupTelegramHandler);
router.post('/:id/send-drive', sendBackupDriveHandler);
router.post('/:id/restore', restoreBackupHandler);
router.delete('/:id', deleteBackupHandler);

export default router;
