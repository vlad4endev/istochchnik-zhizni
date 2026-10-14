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
  uploadBackupHandler,
} from '../controllers/backupController';
import { backupUploadMiddleware } from '../middleware/backupUpload';

const router = Router();

router.get('/settings', getBackupSettingsHandler);
router.patch('/settings', patchBackupSettingsHandler);
router.get('/list', listBackupsHandler);
router.post('/create', createBackupHandler);
router.post('/upload', backupUploadMiddleware, uploadBackupHandler);
router.get('/:id/download', downloadBackupHandler);
router.post('/:id/send-telegram', sendBackupTelegramHandler);
router.post('/:id/restore', restoreBackupHandler);
router.delete('/:id', deleteBackupHandler);

export default router;
