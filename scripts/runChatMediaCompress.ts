/**
 * Ручной запуск сжатия медиа чатов.
 *
 *   npx ts-node scripts/runChatMediaCompress.ts
 *   npx ts-node scripts/runChatMediaCompress.ts --dry-run
 *   npx ts-node scripts/runChatMediaCompress.ts --force   # даже если DISABLE_…=true
 */
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main(): Promise<void> {
  const { runChatMediaCompress, summarizeChatMediaCompress } = await import(
    '../src/services/chatMediaCompressService'
  );
  const result = await runChatMediaCompress();
  console.log(`[chat-media-compress] ${summarizeChatMediaCompress(result)}`);
  if (result.stoppedReason === 'no_storage') {
    process.exitCode = 2;
  } else if (result.failed > 0) {
    process.exitCode = 1;
  }
}

void main().catch((e) => {
  console.error('[chat-media-compress] fatal:', e);
  process.exit(1);
});
