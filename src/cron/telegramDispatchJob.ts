import { processTelegramDispatchDue } from '../services/telegramService';

let timer: NodeJS.Timeout | null = null;
let running = false;

export function initTelegramDispatchJob(): void {
  if (timer) return;
  timer = setInterval(() => {
    if (running) return;
    running = true;
    void processTelegramDispatchDue()
      .catch((error) => {
        console.error('[telegram-dispatch] tick failed:', error);
      })
      .finally(() => {
        running = false;
      });
  }, 30_000);
}

