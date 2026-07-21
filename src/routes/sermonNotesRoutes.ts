import { Router } from 'express';

import {
  sermonNotesCreate,
  sermonNotesDelete,
  sermonNotesGet,
  sermonNotesList,
  sermonNotesShare,
  sermonNotesUpdate,
} from '../controllers/sermonNotesController';
import { requireAuthSession } from '../middleware/authSession';

const router = Router();

router.use(requireAuthSession);

router.get('/', sermonNotesList);
router.post('/', sermonNotesCreate);
router.get('/:id', sermonNotesGet);
router.patch('/:id', sermonNotesUpdate);
router.patch('/:id/share', sermonNotesShare);
router.delete('/:id', sermonNotesDelete);

export default router;
