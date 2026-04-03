import { Router } from 'express';
import {
  getTelegramSettingsHandler,
  patchTelegramSettingsHandler,
  postTelegramSendHandler,
} from '../controllers/telegramController';

const router = Router();

router.get('/settings', getTelegramSettingsHandler);
router.patch('/settings', patchTelegramSettingsHandler);
router.post('/send', postTelegramSendHandler);

export default router;
