import { Router } from 'express';
import {
  getAiProviderModelsHandler,
  getAiSettingsAdminHandler,
  patchAiSettingsHandler,
  postAiTestHandler,
} from '../controllers/aiSettingsController';
import {
  createAiKnowledgeHandler,
  deleteAiKnowledgeHandler,
  listAiKnowledgeHandler,
  reindexAiKnowledgeHandler,
} from '../controllers/aiKnowledgeController';
import {
  getAssistantConversationMessagesAdminHandler,
  listAssistantConversationsAdminHandler,
} from '../controllers/assistantMonitorController';
import { aiKnowledgeUploadMiddleware } from '../middleware/aiKnowledgeUpload';
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
import {
  getCallJournalHandler,
  getCallLogDetailHandler,
  getCallSettingsAdminHandler,
  getCallUsageStatsHandler,
  patchCallSettingsHandler,
  postLiveKitTestHandler,
} from '../controllers/callSettingsController';

const router = Router();

router.get('/notifications', getNotificationSettingsPublic);
router.get('/notifications/admin', getNotificationSettingsAdmin);
router.patch('/notifications', patchNotificationSettings);
router.get('/logs/admin', getAppLogsAdmin);
router.get('/logs/telegram-sends', getTelegramSendLogsAdmin);

/** Настройки языковых моделей (только админ). */
router.get('/ai/admin', getAiSettingsAdminHandler);
router.get('/ai/models', getAiProviderModelsHandler);
router.patch('/ai', patchAiSettingsHandler);
router.post('/ai/test', postAiTestHandler);
/** Мониторинг диалогов с ИИ-помощником (только админ). */
router.get('/ai/conversations', listAssistantConversationsAdminHandler);
router.get('/ai/conversations/:id/messages', getAssistantConversationMessagesAdminHandler);
/** Локальная RAG-база знаний (только админ). */
router.get('/ai/knowledge', listAiKnowledgeHandler);
router.post('/ai/knowledge', aiKnowledgeUploadMiddleware, createAiKnowledgeHandler);
router.delete('/ai/knowledge/:id', deleteAiKnowledgeHandler);
router.post('/ai/knowledge/:id/reindex', reindexAiKnowledgeHandler);
router.get('/sections', getSectionVisibilitySettingsPublic);
router.get('/sections/admin', getSectionVisibilitySettingsAdmin);
router.patch('/sections', patchSectionVisibilitySettingsHandler);
router.get('/role-permissions', getRolePermissionsSettingsPublic);
router.get('/role-permissions/admin', getRolePermissionsSettingsAdmin);
router.patch('/role-permissions', patchRolePermissionsSettingsHandler);
router.post('/role-permissions/reset', resetRolePermissionsSettingsHandler);

/** Настройки LiveKit-звонков и статистика использования (только админ). */
router.get('/calls/admin', getCallSettingsAdminHandler);
router.patch('/calls', patchCallSettingsHandler);
router.post('/calls/livekit/test', postLiveKitTestHandler);
router.get('/calls/stats', getCallUsageStatsHandler);
router.get('/calls/journal', getCallJournalHandler);
router.get('/calls/:callId/log', getCallLogDetailHandler);

export default router;
