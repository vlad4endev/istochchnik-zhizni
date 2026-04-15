import { Router } from 'express';
import {
  getNotificationSettingsAdmin,
  getNotificationSettingsPublic,
  patchNotificationSettings,
} from '../controllers/notificationSettingsController';
import { getAppLogsAdmin } from '../controllers/appLogController';

const router = Router();

router.get('/notifications', getNotificationSettingsPublic);
router.get('/notifications/admin', getNotificationSettingsAdmin);
router.patch('/notifications', patchNotificationSettings);
router.get('/logs/admin', getAppLogsAdmin);

export default router;
