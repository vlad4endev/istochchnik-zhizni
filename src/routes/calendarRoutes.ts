import { Router } from 'express';
import {
  getNextWeekMembers,
  getPrayerBotMessage,
  getPrayerData,
  getTodayPrayerBotMessage,
} from '../controllers/calendarController';
import {
  getThemes,
  postTheme,
  patchTheme,
  deleteTheme,
  getMinistries,
  postMinistry,
  patchMinistry,
  deleteMinistryHandler,
  getBacksliders,
  postBackslider,
  patchBackslider,
  deleteBacksliderHandler,
  getNextWeekGlobal,
} from '../controllers/globalNeedsController';

const router = Router();

router.get('/next-week/members', getNextWeekMembers);
router.get('/next-week/global', getNextWeekGlobal);
router.get('/bot-message/today', getTodayPrayerBotMessage);
router.get('/bot-message/:date', getPrayerBotMessage);

router.get('/global/themes', getThemes);
router.post('/global/themes', postTheme);
router.patch('/global/themes/:id', patchTheme);
router.delete('/global/themes/:id', deleteTheme);

router.get('/global/ministries', getMinistries);
router.post('/global/ministries', postMinistry);
router.patch('/global/ministries/:id', patchMinistry);
router.delete('/global/ministries/:id', deleteMinistryHandler);

router.get('/global/backsliders', getBacksliders);
router.post('/global/backsliders', postBackslider);
router.patch('/global/backsliders/:id', patchBackslider);
router.delete('/global/backsliders/:id', deleteBacksliderHandler);

router.get('/:date', getPrayerData);

export default router;
