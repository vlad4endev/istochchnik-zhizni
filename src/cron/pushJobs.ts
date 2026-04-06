import cron from 'node-cron';
import { runNotificationRulesTick } from '../services/notificationRulesRunner';

/**
 * Расписание push-уведомлений задаётся в админке (`/api/settings/notifications`).
 * Здесь минутный тик: при совпадении локального времени церкви с правилом срабатывает отправка.
 */
export function initPushCronJobs() {
  cron.schedule(
    '* * * * *',
    async () => {
      try {
        await runNotificationRulesTick();
      } catch (e) {
        console.error('[CRON] notification rules tick', e);
      }
    },
    { timezone: 'UTC' },
  );
}
