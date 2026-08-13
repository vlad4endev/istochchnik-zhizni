import { Router } from 'express';
import {
  getAiSettingsAdminHandler,
  patchAiSettingsHandler,
  postAiTestHandler,
} from '../controllers/aiSettingsController';
import {
  getAssistantConversationMessagesAdminHandler,
  listAssistantConversationsAdminHandler,
} from '../controllers/assistantMonitorController';
import {
  getNotificationSettingsAdmin,
  getNotificationSettingsPublic,
  patchNotificationSettings,
} from '../controllers/notificationSettingsController';
import { getAppLogsAdmin, getTelegramSendLogsAdmin } from '../controllers/appLogController';
import {
  getSectionVisibilitySettingsAdmin,
  getSectionVisibilitySettingsPublic,
  patchSectionVisibilitySettingsHandler,
} from '../controllers/sectionVisibilitySettingsController';
import {
  getRolePermissionsSettingsAdmin,
  getRolePermissionsSettingsPublic,
  patchRolePermissionsSettingsHandler,
  resetRolePermissionsSettingsHandler,
} from '../controllers/rolePermissionsSettingsController';

const router = Router();

router.get('/notifications', getNotificationSettingsPublic);
router.get('/notifications/admin', getNotificationSettingsAdmin);
router.patch('/notifications', patchNotificationSettings);
router.get('/logs/admin', getAppLogsAdmin);
router.get('/logs/telegram-sends', getTelegramSendLogsAdmin);

/** Настройки языковых моделей (только админ). */
router.get('/ai/admin', getAiSettingsAdminHandler);
router.patch('/ai', patchAiSettingsHandler);
router.post('/ai/test', postAiTestHandler);
/** Мониторинг диалогов с ИИ-помощником (только админ). */
router.get('/ai/conversations', listAssistantConversationsAdminHandler);
router.get('/ai/conversations/:id/messages', getAssistantConversationMessagesAdminHandler);
router.get('/sections', getSectionVisibilitySettingsPublic);
router.get('/sections/admin', getSectionVisibilitySettingsAdmin);
router.patch('/sections', patchSectionVisibilitySettingsHandler);
router.get('/role-permissions', getRolePermissionsSettingsPublic);
router.get('/role-permissions/admin', getRolePermissionsSettingsAdmin);
router.patch('/role-permissions', patchRolePermissionsSettingsHandler);
router.post('/role-permissions/reset', resetRolePermissionsSettingsHandler);

export default router;
