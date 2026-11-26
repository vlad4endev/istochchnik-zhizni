import { processTelegramDispatchDue } from '../services/telegramService';
import { recordCronHeartbeat } from '../diagnostics/monitor/metrics';

let timer: NodeJS.Timeout | null = null;
let running = false;

export function initTelegramDispatchJob(): void {
  if (timer) return;
  timer = setInterval(() => {
    if (running) return;
    running = true;
    const startedAt = Date.now();
    void processTelegramDispatchDue()
      .then(() => {
        recordCronHeartbeat('Рассылка Telegram (30с)', true, Date.now() - startedAt);
      })
      .catch((error) => {
        recordCronHeartbeat('Рассылка Telegram (30с)', false, Date.now() - startedAt, error);
        console.error('[telegram-dispatch] tick failed:', error);
      })
      .finally(() => {
        running = false;
      });
  }, 30_000);
}

