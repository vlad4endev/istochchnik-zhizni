import cron from 'node-cron';

import { deleteExpiredCallEvents, getCallJournalRetentionDays } from '../services/callEventsService';

let running = false;

/**
 * Один прогон ретенции журнала звонков. Защищён флагом от наложения:
 * ежесуточная задача и отложенный стартовый прогон не могут идти параллельно.
 */
export async function runCallJournalRetentionOnce(): Promise<{ deleted: number }> {
  if (running) return { deleted: 0 };
  running = true;
  try {
    const days = getCallJournalRetentionDays();
    const deleted = await deleteExpiredCallEvents(days);
    if (deleted > 0) {
      console.log('[calls] journal retention:', { retentionDays: days, deleted });
    }
    return { deleted };
  } catch (e) {
    console.warn('[calls] journal retention failed:', e instanceof Error ? e.message : e);
    return { deleted: 0 };
  } finally {
    running = false;
  }
}

/**
 * Ежесуточная очистка старых событий журнала (по умолчанию 04:30).
 * Раньше это делалось в тике cleanupStaleCalls каждые 15 секунд одним DELETE
 * без батчей — вынесено сюда. Плюс отложенный прогон через 2 минуты после
 * старта: на серверах, которые перезапускаются чаще, чем наступает 04:30,
 * ретенция всё равно выполняется.
 */
export function initCallJournalRetentionJob(): void {
  if (process.env.DISABLE_CALLS_CLEANUP_CRON === 'true') {
    console.log('[calls] journal retention cron disabled');
    return;
  }
  const expr = process.env.CALL_JOURNAL_RETENTION_CRON?.trim() || '30 4 * * *';
  if (!cron.validate(expr)) {
    console.warn('[calls] invalid CALL_JOURNAL_RETENTION_CRON, using 30 4 * * *');
  }
  const schedule = cron.validate(expr) ? expr : '30 4 * * *';

  cron.schedule(schedule, () => {
    void runCallJournalRetentionOnce();
  });

  const bootTimer = setTimeout(() => {
    void runCallJournalRetentionOnce();
  }, 120_000);
  bootTimer.unref();

  console.log('[calls] journal retention cron scheduled:', schedule);
}
