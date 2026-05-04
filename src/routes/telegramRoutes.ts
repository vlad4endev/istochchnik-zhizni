import { Router } from 'express';
import {
  getTelegramDispatchRecipientsHandler,
  getTelegramDispatchSettingsHandler,
  getTelegramSettingsHandler,
  patchTelegramDispatchSettingsHandler,
  patchTelegramSettingsHandler,
  postTelegramDispatchRunNowHandler,
  postTelegramSendHandler,
} from '../controllers/telegramController';

const router = Router();

router.get('/settings', getTelegramSettingsHandler);
router.patch('/settings', patchTelegramSettingsHandler);
router.get('/dispatch/settings', getTelegramDispatchSettingsHandler);
router.patch('/dispatch/settings', patchTelegramDispatchSettingsHandler);
router.get('/dispatch/recipients', getTelegramDispatchRecipientsHandler);
router.post('/dispatch/run-now', postTelegramDispatchRunNowHandler);
router.post('/send', postTelegramSendHandler);

export default router;
