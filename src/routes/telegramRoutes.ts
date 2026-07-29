import { Router } from 'express';
import {
  deleteTelegramChatHandler,
  getTelegramChatsHandler,
  getTelegramDispatchPreviewPrayerHandler,
  getTelegramDispatchRecipientsHandler,
  getTelegramDispatchSettingsHandler,
  getTelegramMailingMessengerChatsHandler,
  getTelegramSettingsHandler,
  patchTelegramDispatchSettingsHandler,
  patchTelegramSettingsHandler,
  postTelegramChatHandler,
  postTelegramChatRefreshHandler,
  postTelegramDispatchRunNowHandler,
  postTelegramSendHandler,
  postTelegramTestConnectionHandler,
  postTelegramTestProxyHandler,
} from '../controllers/telegramController';

const router = Router();

router.get('/settings', getTelegramSettingsHandler);
router.patch('/settings', patchTelegramSettingsHandler);
router.get('/mailing-messenger-chats', getTelegramMailingMessengerChatsHandler);
router.get('/chats', getTelegramChatsHandler);
router.post('/chats', postTelegramChatHandler);
router.post('/chats/:id/refresh', postTelegramChatRefreshHandler);
router.delete('/chats/:id', deleteTelegramChatHandler);
router.get('/dispatch/settings', getTelegramDispatchSettingsHandler);
router.patch('/dispatch/settings', patchTelegramDispatchSettingsHandler);
router.get('/dispatch/recipients', getTelegramDispatchRecipientsHandler);
router.get('/dispatch/preview-prayer', getTelegramDispatchPreviewPrayerHandler);
router.post('/dispatch/run-now', postTelegramDispatchRunNowHandler);
router.post('/test-connection', postTelegramTestConnectionHandler);
router.post('/test-proxy', postTelegramTestProxyHandler);
router.post('/send', postTelegramSendHandler);

export default router;
