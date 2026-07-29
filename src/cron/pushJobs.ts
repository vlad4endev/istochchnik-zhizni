import cron from 'node-cron';
import { notifyRealtime } from '../realtime/notify';
import { snapshotPastCyclePrayersToHistory } from '../services/prayerCycleService';
import { runNotificationRulesTick } from '../services/notificationRulesRunner';
import { DistributionService } from '../services/DistributionService';
import { sendPush } from '../services/pushService';
import { dispatchDueSermonFeedbackNotifications } from '../services/sermonFeedbackService';
import { sendMediaScheduleReminders } from '../services/mediaScheduleService';
import { sendMusicScheduleReminders } from '../services/musicScheduleService';
import { processServicePlanMailingDue } from '../services/servicePlanMondayMailingService';
import {
  notifyCoordinatorTelegramAssignment,
  processCoordinatorTelegramScenariosDue,
} from '../services/coordinatorTelegramScenariosService';

type CuratorWeekKind = 'current' | 'next';

async function pushCuratorAssignmentsForWeek(
  service: DistributionService,
  weekKind: CuratorWeekKind,
  pushType: 'curator_week_assignments' | 'curator_week_assignments_auto',
): Promise<{ sent: number; total: number }> {
  const assignments = await service.getCoordinatorAssignmentsForQueueWeek(weekKind);
  let sent = 0;
  for (const row of assignments) {
    if (row.members.length === 0) {
      continue;
    }
    const top = row.members.slice(0, 5).map((m) => m.memberName).join(', ');
    const suffix = row.members.length > 5 ? ` и еще ${row.members.length - 5}` : '';
    const weekLabel = weekKind === 'current' ? 'эту' : 'следующую';
    const title = 'Сбор молитвенных нужд: назначения на неделю';
    const body = `На ${weekLabel} неделю вам назначено ${row.members.length} участник(ов): ${top}${suffix}.`;
    try {
      await sendPush(row.coordinatorId, title, body, {
        url: '/dashboard',
        type: pushType,
        week_kind: weekKind,
        week_start: row.weekStartDate,
        cycle_index: String(row.cycleIndex),
      });
      sent += 1;
    } catch (pushErr) {
      console.warn(
        `[CRON] curator assignments push failed for coordinator ${row.coordinatorId}:`,
        pushErr,
      );
    }
    try {
      await notifyCoordinatorTelegramAssignment({
        coordinatorId: row.coordinatorId,
        title,
        body,
        weekKind,
        coordinatorName: row.coordinatorName,
      });
    } catch (tgErr) {
      console.warn(
        `[CRON] curator assignments telegram failed for coordinator ${row.coordinatorId}:`,
        tgErr,
      );
    }
  }
  return { sent, total: assignments.length };
}

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
      try {
        const mailing = await processServicePlanMailingDue();
        if (mailing.triggered && mailing.result) {
          const result = mailing.result;
          if (result.skipped) {
            console.log(
              `[CRON] service plan mailing skipped: ${result.reason ?? 'unknown'} (sunday ${result.service_date ?? '—'})`,
            );
          } else {
            console.log(
              `[CRON] service plan mailing: ok=${result.ok} messenger=${result.messenger_ok} telegram=${result.telegram_ok} plan=${result.plan_id ?? '—'} sunday=${result.service_date ?? '—'}`,
            );
          }
        }
      } catch (e) {
        console.error('[CRON] service plan mailing tick', e);
      }
      try {
        const coordTg = await processCoordinatorTelegramScenariosDue();
        if (coordTg.triggered.length > 0) {
          console.log(
            `[CRON] coordinator telegram scenarios: ${coordTg.triggered.join(', ')}`,
          );
        }
      } catch (e) {
        console.error('[CRON] coordinator telegram scenarios tick', e);
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
        const result = await pushCuratorAssignmentsForWeek(
          service,
          'current',
          'curator_week_assignments',
        );
        if (result.total > 0) {
          console.log(
            `[CRON] curator assignments push sent for ${result.sent}/${result.total} coordinator(s)`,
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
        const pushResult = await pushCuratorAssignmentsForWeek(
          service,
          'next',
          'curator_week_assignments_auto',
        );
        console.log(
          `[CRON] curator distribution synced for queue week ${result.week.year}-W${String(result.week.weekNumber).padStart(2, '0')} (cycle ${result.cycleIndex}): ${result.assignments.length} assignments; push ${pushResult.sent}/${pushResult.total}`,
        );
        notifyRealtime(['calendar']);
      } catch (e) {
        console.error('[CRON] curator distribution', e);
      }
    },
    { timezone: process.env.CURATOR_DISTRIBUTION_TZ?.trim() || 'Europe/Moscow' },
  );

  /** Раз в сутки в 18:00 МСК: напоминания медиа-команде о службе завтра. */
  cron.schedule(
    process.env.MEDIA_SCHEDULE_REMINDER_CRON ?? '0 18 * * *',
    async () => {
      if (process.env.DISABLE_MEDIA_SCHEDULE_REMINDER_CRON === 'true') {
        return;
      }
      try {
        const sent = await sendMediaScheduleReminders();
        if (sent > 0) {
          console.log(`[CRON] media schedule reminders sent: ${sent}`);
        }
      } catch (e) {
        console.error('[CRON] media schedule reminders', e);
      }
    },
    { timezone: process.env.MEDIA_SCHEDULE_REMINDER_TZ?.trim() || 'Europe/Moscow' },
  );

  /** Раз в сутки в 18:00 МСК: напоминания музыкальной команде о службе завтра. */
  cron.schedule(
    process.env.MUSIC_SCHEDULE_REMINDER_CRON ?? '0 18 * * *',
    async () => {
      if (process.env.DISABLE_MUSIC_SCHEDULE_REMINDER_CRON === 'true') {
        return;
      }
      try {
        const sent = await sendMusicScheduleReminders();
        if (sent > 0) {
          console.log(`[CRON] music schedule reminders sent: ${sent}`);
        }
      } catch (e) {
        console.error('[CRON] music schedule reminders', e);
      }
    },
    { timezone: process.env.MUSIC_SCHEDULE_REMINDER_TZ?.trim() || 'Europe/Moscow' },
  );

  /** Раз в 10 минут: по истечении 5 часов после собрания отправляем проповеднику комментарии к проповеди. */
  cron.schedule(
    '*/10 * * * *',
    async () => {
      if (process.env.DISABLE_SERMON_FEEDBACK_NOTIFY_CRON === 'true') {
        return;
      }
      try {
        const sent = await dispatchDueSermonFeedbackNotifications();
        if (sent > 0) {
          console.log(`[CRON] sermon feedback notifications sent: ${sent}`);
        }
      } catch (e) {
        console.error('[CRON] sermon feedback notifications', e);
      }
    },
    { timezone: 'UTC' },
  );
}
