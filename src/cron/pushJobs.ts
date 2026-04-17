import cron from 'node-cron';
import { notifyRealtime } from '../realtime/notify';
import { snapshotPastCyclePrayersToHistory } from '../services/userService';
import { runNotificationRulesTick } from '../services/notificationRulesRunner';
import { DistributionService } from '../services/DistributionService';
import { sendPush } from '../services/pushService';

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

  /** В понедельник в 08:00: напоминание кураторам о закреплённых участниках недели. */
  cron.schedule(
    process.env.CURATOR_ASSIGNMENTS_PUSH_CRON ?? '0 8 * * 1',
    async () => {
      if (process.env.DISABLE_CURATOR_ASSIGNMENTS_PUSH_CRON === 'true') {
        return;
      }
      try {
        const service = new DistributionService();
        const assignments = await service.getCoordinatorAssignmentsForQueueWeek('current');
        for (const row of assignments) {
          if (row.members.length === 0) {
            continue;
          }
          const top = row.members.slice(0, 5).map((m) => m.memberName).join(', ');
          const suffix =
            row.members.length > 5 ? ` и еще ${row.members.length - 5}` : '';
          const body = `На эту неделю вам назначено ${row.members.length} участник(ов): ${top}${suffix}.`;
          await sendPush(row.coordinatorId, 'Сбор молитвенных нужд: назначения на неделю', body, {
            url: '/dashboard',
            type: 'curator_week_assignments',
            week_start: row.weekStartDate,
            cycle_index: String(row.cycleIndex),
          });
        }
        if (assignments.length > 0) {
          console.log(
            `[CRON] curator assignments push sent for ${assignments.length} coordinator(s)`,
          );
        }
      } catch (e) {
        console.error('[CRON] curator assignments push', e);
      }
    },
    { timezone: process.env.CURATOR_ASSIGNMENTS_PUSH_TZ?.trim() || 'Europe/Moscow' },
  );

  /** Еженедельное авто-распределение участников между кураторами на следующую неделю. */
  cron.schedule(
    process.env.CURATOR_DISTRIBUTION_CRON ?? '5 0 * * 1',
    async () => {
      if (process.env.DISABLE_CURATOR_DISTRIBUTION_CRON === 'true') {
        return;
      }
      try {
        const service = new DistributionService();
        const result = await service.executeAndSaveForCollectionQueueWeek('next');
        console.log(
          `[CRON] curator distribution synced for queue week ${result.week.year}-W${String(result.week.weekNumber).padStart(2, '0')} (cycle ${result.cycleIndex}): ${result.assignments.length} assignments`,
        );
        notifyRealtime(['calendar']);
      } catch (e) {
        console.error('[CRON] curator distribution', e);
      }
    },
    { timezone: process.env.CURATOR_DISTRIBUTION_TZ?.trim() || 'Europe/Moscow' },
  );
}
