import { Router } from 'express';
import { getBroadcastEmbed, updateBroadcastEmbed } from '../controllers/broadcastController';

const router = Router();

router.get('/broadcast', getBroadcastEmbed);
router.patch('/broadcast', updateBroadcastEmbed);

export default router;
