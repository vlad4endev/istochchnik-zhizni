import { Router } from 'express';
import {
  getTelegramDispatchPreviewPrayerHandler,
  getTelegramDispatchRecipientsHandler,
  getTelegramDispatchSettingsHandler,
  getTelegramMailingMessengerChatsHandler,
  getTelegramSettingsHandler,
  patchTelegramDispatchSettingsHandler,
  patchTelegramSettingsHandler,
  postTelegramDispatchRunNowHandler,
  postTelegramSendHandler,
  postTelegramTestConnectionHandler,
  postTelegramTestProxyHandler,
} from '../controllers/telegramController';

const router = Router();

router.get('/settings', getTelegramSettingsHandler);
router.patch('/settings', patchTelegramSettingsHandler);
router.get('/mailing-messenger-chats', getTelegramMailingMessengerChatsHandler);
router.get('/dispatch/settings', getTelegramDispatchSettingsHandler);
router.patch('/dispatch/settings', patchTelegramDispatchSettingsHandler);
router.get('/dispatch/recipients', getTelegramDispatchRecipientsHandler);
router.get('/dispatch/preview-prayer', getTelegramDispatchPreviewPrayerHandler);
router.post('/dispatch/run-now', postTelegramDispatchRunNowHandler);
router.post('/test-connection', postTelegramTestConnectionHandler);
router.post('/test-proxy', postTelegramTestProxyHandler);
router.post('/send', postTelegramSendHandler);

export default router;
