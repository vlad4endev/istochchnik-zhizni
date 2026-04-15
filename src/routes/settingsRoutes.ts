import { Router } from 'express';
import {
  getAiSettingsAdminHandler,
  patchAiSettingsHandler,
  postAiTestHandler,
} from '../controllers/aiSettingsController';
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

/** Настройки языковых моделей (только админ). */
router.get('/ai/admin', getAiSettingsAdminHandler);
router.patch('/ai', patchAiSettingsHandler);
router.post('/ai/test', postAiTestHandler);

export default router;
