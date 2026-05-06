import cron from 'node-cron';
import { runAppLogCleanup, writeAppLog } from '../services/appLogService';

let isRunning = false;

export function initAppLogCleanupJob(): void {
  cron.schedule(
    process.env.APP_LOG_CLEANUP_CRON ?? '15 3 * * 0',
    async () => {
      if (process.env.DISABLE_APP_LOG_CLEANUP_CRON === 'true') {
        return;
      }
      if (isRunning) {
        return;
      }
      isRunning = true;
      try {
        const cleanup = await runAppLogCleanup();
        const details = `retention=${cleanup.deletedByRetention}, limit=${cleanup.deletedByLimit}`;
        console.log(`[CRON] app log cleanup: ${details}`);
        await writeAppLog({
          level: 'info',
          scope: 'app_log',
          event: 'app_log.cleanup.weekly',
          message: `Автоочистка журнала выполнена (${details})`,
          context: cleanup,
        });
      } catch (error) {
        console.error('[CRON] app log cleanup failed:', error);
        await writeAppLog({
          level: 'error',
          scope: 'app_log',
          event: 'app_log.cleanup.failed',
          message: 'Ошибка автоочистки журнала',
          context: { error: error instanceof Error ? error.message : String(error) },
        });
      } finally {
        isRunning = false;
      }
    },
    { timezone: process.env.APP_LOG_CLEANUP_TZ?.trim() || 'Europe/Moscow' },
  );
}
