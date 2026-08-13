import { Router } from 'express';
import {
  createBackupHandler,
  deleteBackupHandler,
  downloadBackupHandler,
  getBackupSettingsHandler,
  listBackupsHandler,
  patchBackupSettingsHandler,
  restoreBackupHandler,
  sendBackupTelegramHandler,
} from '../controllers/backupController';

const router = Router();

router.get('/settings', getBackupSettingsHandler);
router.patch('/settings', patchBackupSettingsHandler);
router.get('/list', listBackupsHandler);
router.post('/create', createBackupHandler);
router.get('/:id/download', downloadBackupHandler);
router.post('/:id/send-telegram', sendBackupTelegramHandler);
router.post('/:id/restore', restoreBackupHandler);
router.delete('/:id', deleteBackupHandler);

export default router;
