import { Router } from 'express';

import {
  sermonNotesCreate,
  sermonNotesDelete,
  sermonNotesGet,
  sermonNotesList,
  sermonNotesUpdate,
} from '../controllers/sermonNotesController';
import { requireAuthSession } from '../middleware/authSession';

const router = Router();

router.use(requireAuthSession);

router.get('/', sermonNotesList);
router.post('/', sermonNotesCreate);
router.get('/:id', sermonNotesGet);
router.patch('/:id', sermonNotesUpdate);
router.delete('/:id', sermonNotesDelete);

export default router;
