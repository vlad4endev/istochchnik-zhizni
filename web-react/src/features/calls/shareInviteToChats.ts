import { sendMessage } from '../messenger/api/messengerApi';
import { useChatStore } from '../messenger/chatStore';

import type { CallMediaType } from './callsApi';

/** Текст приглашения, который уходит в чат от имени пользователя. */
export function formatInviteChatMessage(
  title: string,
  url: string,
  mediaType: CallMediaType = 'video',
): string {
  const name = title.trim();
  const link = url.trim();
  const kind = mediaType === 'audio' ? 'аудиовстречу' : 'видеовстречу';
  const head = name ? `Приглашаю на ${kind} «${name}»` : `Приглашаю на ${kind}`;
  return link ? `${head}\n${link}` : head;
}

function newClientMsgId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export type ShareInviteResult = {
  sent: string[];
  failed: Array<{ conversationId: string; reason: string }>;
};

function failureReason(e: unknown): string {
  if (e && typeof e === 'object' && 'response' in e) {
    const msg = (e as { response?: { data?: { error?: unknown } } }).response?.data?.error;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  return 'Не удалось отправить';
}

/**
 * Отправляет приглашение в выбранные чаты как обычное сообщение пользователя.
 * Успешные сообщения сразу попадают в локальный стор, чтобы чат был актуален без ожидания WS.
 */
export async function sendInviteToConversations(
  conversationIds: string[],
  text: string,
): Promise<ShareInviteResult> {
  const unique = [...new Set(conversationIds.map(String))];
  const settled = await Promise.allSettled(
    unique.map(async (conversationId) => {
      const real = await sendMessage(
        conversationId,
        text,
        null,
        newClientMsgId(),
        undefined,
        undefined,
        { silentErrorToast: true },
      );
      useChatStore.getState().handleNewMessage(conversationId, { ...real, status: 'sent' });
      return conversationId;
    }),
  );

  const result: ShareInviteResult = { sent: [], failed: [] };
  settled.forEach((r, i) => {
    const conversationId = unique[i]!;
    if (r.status === 'fulfilled') result.sent.push(conversationId);
    else result.failed.push({ conversationId, reason: failureReason(r.reason) });
  });
  return result;
}
