import cron from 'node-cron';
import { getAllSubscriptions, getSubscriptionsForCoordinators, sendNotificationToSubscription } from '../services/pushService';
import { getNextWeekMemberAssignments } from '../services/calendarService';

export function initPushCronJobs() {
  // Ежедневное напоминание помолиться в 09:00
  cron.schedule('0 9 * * *', async () => {
    console.log('[CRON] Запуск ежедневного напоминания о молитве');
    try {
      const allSubs = await getAllSubscriptions();
      const payload = {
        title: 'Время молитвы',
        body: 'Напоминание: уделите время молитве за нужды церкви.',
        url: '/'
      };

      for (const item of allSubs) {
        await sendNotificationToSubscription(item.sub, payload);
      }
      console.log(`[CRON] Отправлено ${allSubs.length} уведомлений.`);
    } catch (e) {
      console.error('[CRON] Ошибка в ежедневном джобе молитвы', e);
    }
  }, {
    timezone: "Europe/Moscow" 
  });

  // Каждое утро понедельника в 09:00 - рассылка для координаторов
  cron.schedule('0 9 * * 1', async () => {
    console.log('[CRON] Запуск еженедельной выборки для координаторов');
    try {
      const coordSubs = await getSubscriptionsForCoordinators();
      if (coordSubs.length === 0) {
        console.log('[CRON] Нет координаторов с подписками');
        return;
      }

      const nextWeekPlan = await getNextWeekMemberAssignments();
      const participantsList = nextWeekPlan
        .filter(item => item.member !== null)
        .map(item => item.member!.name)
        .join(', ');

      const payload = {
        title: 'Сбор нужд на следующую неделю',
        body: participantsList ? `Участники: ${participantsList}` : 'На следующую неделю нет распределённых участников.',
        url: '/calendar' // or anywhere appropriate
      };

      for (const item of coordSubs) {
        await sendNotificationToSubscription(item.sub, payload);
      }
      console.log(`[CRON] Отправлено ${coordSubs.length} уведомлений координаторам.`);
    } catch (e) {
      console.error('[CRON] Ошибка в еженедельном джобе координаторов', e);
    }
  }, {
    timezone: "Europe/Moscow"
  });
}
