import { Router } from 'express';
import {
  getCycleCollectionClaims,
  getWeekBirthdays,
  getNextWeekMembers,
  getPrayerBotMessage,
  getPrayerData,
  getTodayPrayerBotMessage,
  patchCycleCollectionClaims,
  patchMemberCyclePrayer,
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
import {
  deleteAllEvents,
  deleteEvent,
  getActiveEvents,
  getAdminEvents,
  patchEvent,
  postEvent,
} from '../controllers/eventsController';

const router = Router();

router.get('/next-week/members', getNextWeekMembers);
router.patch('/member-cycle-prayer', patchMemberCyclePrayer);
router.get('/cycle/collection-claims', getCycleCollectionClaims);
router.patch('/cycle/collection-claims', patchCycleCollectionClaims);
/** Совместимость: старые клиенты / кэш PWA ходили на next-week/collection. */
router.get('/next-week/collection', getCycleCollectionClaims);
router.patch('/next-week/collection', patchCycleCollectionClaims);
router.get('/next-week/global', getNextWeekGlobal);
router.get('/birthdays/week', getWeekBirthdays);
router.get('/events', getActiveEvents);
router.get('/events/admin', getAdminEvents);
router.post('/events', postEvent);
router.delete('/events', deleteAllEvents);
router.patch('/events/:id', patchEvent);
router.delete('/events/:id', deleteEvent);
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
