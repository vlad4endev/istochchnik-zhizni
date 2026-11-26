import cron from 'node-cron';

import { cleanupStaleCalls } from '../services/callsService';
import { recordCronHeartbeat } from '../diagnostics/monitor/metrics';

export function initCallsCleanupJob(): void {
  if (process.env.DISABLE_CALLS_CLEANUP_CRON === 'true') {
    console.log('[calls] cleanup cron disabled');
    return;
  }
  // Every 15 seconds — ring timeouts need near-realtime handling
  const expr = process.env.CALLS_CLEANUP_CRON?.trim() || '*/15 * * * * *';
  if (!cron.validate(expr)) {
    console.warn('[calls] invalid CALLS_CLEANUP_CRON, using */15 * * * * *');
  }
  const schedule = cron.validate(expr) ? expr : '*/15 * * * * *';

  cron.schedule(schedule, () => {
    const startedAt = Date.now();
    void cleanupStaleCalls()
      .then((r) => {
        recordCronHeartbeat('Очистка звонков (15с)', true, Date.now() - startedAt);
        if (r.missed > 0 || r.endedEmpty > 0 || r.ghostsCleared > 0) {
          console.log('[calls] cleanup', r);
        }
      })
      .catch((e) => {
        recordCronHeartbeat('Очистка звонков (15с)', false, Date.now() - startedAt, e);
        console.warn('[calls] cleanup failed:', e instanceof Error ? e.message : e);
      });
  });

  console.log('[calls] cleanup cron scheduled:', schedule);
}
