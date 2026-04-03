import cron from 'node-cron';
import { getCoordinatorMemberIdsWithPush, getMemberIdsWithAnyPushSubscription } from '../services/fcmSubscriptionService';
import { sendPush } from '../services/pushService';
import { getNextWeekMemberAssignments } from '../services/calendarService';

export function initPushCronJobs() {
  // Ежедневное напоминание помолиться в 09:00
  cron.schedule(
    '0 9 * * *',
    async () => {
      console.log('[CRON] Запуск ежедневного напоминания о молитве');
      try {
        const memberIds = await getMemberIdsWithAnyPushSubscription();
        const payload = {
          title: 'Время молитвы',
          body: 'Напоминание: уделите время молитве за нужды церкви.',
          url: '/',
        };

        for (const memberId of memberIds) {
          await sendPush(memberId, payload.title, payload.body, { url: payload.url });
        }
        console.log(`[CRON] Ежедневное напоминание: ${memberIds.length} участников.`);
      } catch (e) {
        console.error('[CRON] Ошибка в ежедневном джобе молитвы', e);
      }
    },
    {
      timezone: 'Europe/Moscow',
    },
  );

  // Каждое утро понедельника в 09:00 - рассылка для координаторов
  cron.schedule(
    '0 9 * * 1',
    async () => {
      console.log('[CRON] Запуск еженедельной выборки для координаторов');
      try {
        const coordIds = await getCoordinatorMemberIdsWithPush();
        if (coordIds.length === 0) {
          console.log('[CRON] Нет координаторов с подписками (web или FCM)');
          return;
        }

        const nextWeekPlan = await getNextWeekMemberAssignments();
        const participantsList = nextWeekPlan
          .filter((item) => item.member !== null)
          .map((item) => item.member!.name)
          .join(', ');

        const title = 'Сбор нужд на следующую неделю';
        const body = participantsList
          ? `Участники: ${participantsList}`
          : 'На следующую неделю нет распределённых участников.';

        for (const id of coordIds) {
          await sendPush(id, title, body, { url: '/calendar' });
        }
        console.log(`[CRON] Отправлено ${coordIds.length} уведомлений координаторам.`);
      } catch (e) {
        console.error('[CRON] Ошибка в еженедельном джобе координаторов', e);
      }
    },
    {
      timezone: 'Europe/Moscow',
    },
  );
}
