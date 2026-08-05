import cron from 'node-cron';
import { writeAppLog } from '../services/appLogService';
import {
  runChatMediaCompress,
  summarizeChatMediaCompress,
} from '../services/chatMediaCompressService';

let isRunning = false;

/** Ежемесячное сжатие медиа вложений чатов в Supabase Storage (1-е число, 03:30 МСК). */
export function initChatMediaCompressJob(): void {
  cron.schedule(
    process.env.CHAT_MEDIA_COMPRESS_CRON ?? '30 3 1 * *',
    async () => {
      if (process.env.DISABLE_CHAT_MEDIA_COMPRESS_CRON === 'true') {
        return;
      }
      if (isRunning) {
        return;
      }
      isRunning = true;
      try {
        const result = await runChatMediaCompress();
        const details = summarizeChatMediaCompress(result);
        console.log(`[CRON] chat media compress: ${details}`);
        await writeAppLog({
          level: result.failed > 0 ? 'warn' : 'info',
          scope: 'messenger',
          event: 'chat_media.compress.monthly',
          message: `Ежемесячное сжатие медиа чатов (${details})`,
          context: { ...result },
        });
      } catch (error) {
        console.error('[CRON] chat media compress failed:', error);
        await writeAppLog({
          level: 'error',
          scope: 'messenger',
          event: 'chat_media.compress.failed',
          message: 'Ошибка ежемесячного сжатия медиа чатов',
          context: { error: error instanceof Error ? error.message : String(error) },
        });
      } finally {
        isRunning = false;
      }
    },
    { timezone: process.env.CHAT_MEDIA_COMPRESS_TZ?.trim() || 'Europe/Moscow' },
  );
}
