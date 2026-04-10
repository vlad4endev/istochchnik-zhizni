import { Router } from 'express';

import { getPublicSetlist } from '../controllers/publicController';

const router = Router();

router.get('/setlists/:token', getPublicSetlist);

export default router;
