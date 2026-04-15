import cron from 'node-cron';
import { notifyRealtime } from '../realtime/notify';
import { snapshotPastCyclePrayersToHistory } from '../services/userService';
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

  /** Раз в сутки: журнал истории молитвенных нужд для уже прошедших циклов (см. snapshotPastCyclePrayersToHistory). */
  cron.schedule(
    '12 0 * * *',
    async () => {
      if (process.env.DISABLE_PRAYER_HISTORY_SNAPSHOT_CRON === 'true') {
        return;
      }
      try {
        const n = await snapshotPastCyclePrayersToHistory();
        if (n > 0) {
          console.log(`[CRON] prayer history snapshot: inserted ${n} row(s)`);
          notifyRealtime(['members']);
        }
      } catch (e) {
        console.error('[CRON] prayer history snapshot', e);
      }
    },
    { timezone: 'UTC' },
  );
}
