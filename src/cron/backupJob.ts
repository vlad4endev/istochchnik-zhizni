import cron from 'node-cron';

import {
  createFullBackup,
  isBackupCreateRunning,
  applyRetention,
} from '../services/backupService';
import { loadBackupSettingsDocument } from '../services/backupSettingsService';

let scheduledTask: ReturnType<typeof cron.schedule> | null = null;
let lastSettingsKey = '';

function buildCronExpression(settings: {
  schedule_time: string;
  schedule_kind: 'daily' | 'weekly';
  schedule_weekdays: number[];
}): string | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(settings.schedule_time);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (settings.schedule_kind === 'daily') {
    return `${minute} ${hour} * * *`;
  }
  const days = settings.schedule_weekdays.length > 0 ? settings.schedule_weekdays : [1];
  // node-cron: 0=Sunday … 6=Saturday — совпадает с нашим форматом
  return `${minute} ${hour} * * ${days.join(',')}`;
}

async function runAutoBackupTick(): Promise<void> {
  if (process.env.DISABLE_BACKUP_CRON === 'true' || process.env.DISABLE_BACKUP_CRON === '1') {
    return;
  }
  if (isBackupCreateRunning()) {
    console.log('[CRON] backup: уже выполняется — пропуск');
    return;
  }
  const settings = await loadBackupSettingsDocument();
  if (!settings.auto_enabled) return;

  console.log('[CRON] backup: старт автобекапа');
  try {
    const result = await createFullBackup({
      sendTelegram: settings.telegram_send,
      trigger: 'auto',
    });
    console.log(`[CRON] backup: OK ${result.id}`);
  } catch (error) {
    console.error('[CRON] backup failed:', error);
  }
}

async function refreshSchedule(): Promise<void> {
  try {
    const settings = await loadBackupSettingsDocument();
    const expr = settings.auto_enabled ? buildCronExpression(settings) : null;
    const key = JSON.stringify({
      auto: settings.auto_enabled,
      expr,
      tz: settings.timezone,
      retention: settings.retention_days,
    });
    if (key === lastSettingsKey) return;
    lastSettingsKey = key;

    if (scheduledTask) {
      scheduledTask.stop();
      scheduledTask = null;
    }

    // Ежедневная подчистка по retention (даже без автобекапа)
    // основное расписание — ниже

    if (!expr) {
      console.log('[CRON] backup: автобекап выключен');
      return;
    }
    if (!cron.validate(expr)) {
      console.error('[CRON] backup: невалидное cron-выражение', expr);
      return;
    }

    scheduledTask = cron.schedule(
      expr,
      () => {
        void runAutoBackupTick();
      },
      { timezone: settings.timezone || 'Europe/Moscow' },
    );
    console.log(`[CRON] backup: расписание «${expr}» TZ=${settings.timezone}`);
  } catch (error) {
    console.error('[CRON] backup schedule refresh failed:', error);
  }
}

export function initBackupJob(): void {
  // Перечитываем настройки раз в минуту (админ мог сохранить новые)
  cron.schedule(
    '* * * * *',
    () => {
      void refreshSchedule();
    },
    { timezone: 'UTC' },
  );

  // Retention cleanup раз в сутки в 04:10
  cron.schedule(
    '10 4 * * *',
    () => {
      void applyRetention().catch((e) => console.error('[CRON] backup retention failed:', e));
    },
    { timezone: 'Europe/Moscow' },
  );

  void refreshSchedule();
  console.log('[CRON] backup job initialized');
}
