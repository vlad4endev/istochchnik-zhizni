import { Router } from 'express';
import {
  deleteDashboardCoordinatorNote,
  getDashboardCoordinatorNotes,
  postDashboardCoordinatorNote,
} from '../controllers/dashboardCoordinatorNotesController';
import { requireAuthSession } from '../middleware/authSession';
import {
  getCycleCollectionClaims,
  getCuratorDistribution,
  deleteMemberPreviousPrayerNeed,
  getWeekBirthdays,
  getNextWeekMembers,
  getPrayerBotMessage,
  getPrayerData,
  getPrayerSectionTodayViewers,
  getCalendarSundayServices,
  getCuratorDistributionTargetWeek,
  getTodayPrayerBotMessage,
  patchCycleCollectionClaims,
  patchMemberCyclePrayer,
  postPrayerNeedImproveText,
  postCuratorDistribution,
  patchMemberPreviousPrayerNeed,
  putMemberPreviousPrayerNeed,
  postPrayerSectionVisit,
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
  deleteOccurrenceOverrideHandler,
  getActiveEvents,
  getAdminEvents,
  getEventCategoryOptions,
  getOccurrenceOverrides,
  patchEvent,
  postEvent,
  putOccurrenceOverride,
  uploadEventPoster,
} from '../controllers/eventsController';
import { eventPosterUploadMiddleware } from '../middleware/eventPosterUpload';

const router = Router();

router.get('/dashboard-coordinator-notes', requireAuthSession, getDashboardCoordinatorNotes);
router.post('/dashboard-coordinator-notes', requireAuthSession, postDashboardCoordinatorNote);
router.delete(
  '/dashboard-coordinator-notes/:kind',
  requireAuthSession,
  deleteDashboardCoordinatorNote,
);

router.get('/next-week/members', getNextWeekMembers);
router.get('/next-week/curator-distribution/week', getCuratorDistributionTargetWeek);
router.get('/next-week/curator-distribution', getCuratorDistribution);
router.post('/next-week/curator-distribution', postCuratorDistribution);
router.post('/prayer-need/improve-text', postPrayerNeedImproveText);
router.patch('/member-cycle-prayer', patchMemberCyclePrayer);
router.patch('/member-previous-prayer-need', patchMemberPreviousPrayerNeed);
router.put('/member-previous-prayer-need/:id', putMemberPreviousPrayerNeed);
router.delete('/member-previous-prayer-need/:id', deleteMemberPreviousPrayerNeed);
router.get('/cycle/collection-claims', getCycleCollectionClaims);
router.patch('/cycle/collection-claims', patchCycleCollectionClaims);
/** Совместимость: старые клиенты / кэш PWA ходили на next-week/collection. */
router.get('/next-week/collection', getCycleCollectionClaims);
router.patch('/next-week/collection', patchCycleCollectionClaims);
router.get('/next-week/global', getNextWeekGlobal);
router.get('/birthdays/week', getWeekBirthdays);
router.get('/sunday-services', getCalendarSundayServices);
router.get('/events/occurrence-overrides', getOccurrenceOverrides);
router.get('/events', getActiveEvents);
router.get('/events/category-options', getEventCategoryOptions);
router.get('/events/admin', getAdminEvents);
router.post('/events/poster', eventPosterUploadMiddleware, uploadEventPoster);
router.post('/events', postEvent);
router.delete('/events', deleteAllEvents);
router.put('/events/:id/occurrences/:ymd', putOccurrenceOverride);
router.delete('/events/:id/occurrences/:ymd', deleteOccurrenceOverrideHandler);
router.patch('/events/:id', patchEvent);
router.delete('/events/:id', deleteEvent);
router.get('/bot-message/today', getTodayPrayerBotMessage);
router.get('/bot-message/:date', getPrayerBotMessage);

router.get('/prayer-section/today-viewers', requireAuthSession, getPrayerSectionTodayViewers);
router.post('/prayer-section/visit', requireAuthSession, postPrayerSectionVisit);

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
