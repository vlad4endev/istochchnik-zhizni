import { Router } from 'express';
import { getSmsSettingsHandler, patchSmsSettingsHandler } from '../controllers/smsController';

const router = Router();

router.get('/settings', getSmsSettingsHandler);
router.patch('/settings', patchSmsSettingsHandler);

export default router;
