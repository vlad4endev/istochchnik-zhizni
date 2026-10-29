import { Router } from 'express';

import {
  bibleAudioGet,
  bibleBooksList,
  bibleChapterGet,
  bibleCommentariesCreate,
  bibleCommentariesDelete,
  bibleCommentariesList,
  bibleNotesCreate,
  bibleNotesDelete,
  bibleNotesList,
  bibleNotesUpdate,
  bibleParseRef,
  biblePlansDayComplete,
  biblePlansDelete,
  biblePlansGenerate,
  biblePlansGet,
  biblePlansList,
  bibleProgressGet,
  bibleProgressPut,
  bibleSearch,
  bibleTranslationsList,
} from '../controllers/bibleController';
import { requireAuthSession } from '../middleware/authSession';

const router = Router();

router.use(requireAuthSession);

router.get('/translations', bibleTranslationsList);
router.get('/books', bibleBooksList);
router.get('/search', bibleSearch);
router.get('/parse-ref', bibleParseRef);
router.get('/chapter/:translation/:book/:chapter', bibleChapterGet);
router.get('/audio/:translation/:book/:chapter', bibleAudioGet);

router.get('/progress', bibleProgressGet);
router.put('/progress', bibleProgressPut);

router.get('/notes', bibleNotesList);
router.post('/notes', bibleNotesCreate);
router.patch('/notes/:id', bibleNotesUpdate);
router.delete('/notes/:id', bibleNotesDelete);

router.get('/plans', biblePlansList);
router.get('/plans/:id', biblePlansGet);
router.post('/plans/generate', biblePlansGenerate);
router.patch('/plans/:id/days/:dayIndex', biblePlansDayComplete);
router.delete('/plans/:id', biblePlansDelete);

router.get('/commentaries', bibleCommentariesList);
router.post('/commentaries', bibleCommentariesCreate);
router.delete('/commentaries/:id', bibleCommentariesDelete);

export default router;
