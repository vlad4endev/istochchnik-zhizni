import type { CallIntent, IncomingCallPush } from './callPush';

/**
 * Ссылка, которую нативное уведомление о звонке (Android) передаёт приложению по нажатию на
 * уведомление или кнопку. Формат собирает Kotlin-код модуля expo-callscreen (CallNotifications.kt),
 * здесь он разбирается; менять имена полей нужно в обоих местах.
 */
export const CALL_LINK_SCHEME = 'istochnik';
export const CALL_LINK_HOST = 'incoming-call';

export type CallLinkAction = 'open' | 'accept' | 'decline';

function decode(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return raw;
  }
}

/** Разбирает ссылку вида `istochnik://incoming-call?action=accept&callId=…`; чужие ссылки возвращают null. */
export function parseIncomingCallLink(url: string | null | undefined): CallIntent | null {
  const raw = String(url ?? '').trim();
  const prefix = `${CALL_LINK_SCHEME}://${CALL_LINK_HOST}`;
  if (!raw.toLowerCase().startsWith(prefix)) return null;
  const rest = raw.slice(prefix.length);
  if (rest && !rest.startsWith('?') && !rest.startsWith('/')) return null;

  const query = rest.includes('?') ? rest.slice(rest.indexOf('?') + 1).split('#')[0]! : '';
  const params: Record<string, string> = {};
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = decode(eq < 0 ? pair : pair.slice(0, eq));
    params[key] = decode(eq < 0 ? '' : pair.slice(eq + 1));
  }

  const callId = (params.callId ?? '').trim();
  if (!callId) return null;
  const call: IncomingCallPush = {
    kind: 'incoming',
    callId,
    callerId: Number(params.callerId) || 0,
    callerName: (params.callerName ?? '').trim() || 'Собеседник',
    callerAvatar: (params.callerAvatar ?? '').trim() || null,
    callType: params.callType === 'video' ? 'video' : 'audio',
    conversationId: (params.conversationId ?? '').trim(),
  };
  const action = params.action === 'accept' ? 'accept' : params.action === 'decline' ? 'decline' : 'open';
  return { type: action, call };
}

/** Тот же формат со стороны JavaScript — для проверок и документации контракта с Kotlin. */
export function buildIncomingCallLink(call: IncomingCallPush, action: CallLinkAction): string {
  const q = (k: string, v: string) => `${k}=${encodeURIComponent(v)}`;
  return (
    `${CALL_LINK_SCHEME}://${CALL_LINK_HOST}?` +
    [
      q('action', action),
      q('callId', call.callId),
      q('callerName', call.callerName),
      q('callType', call.callType),
      q('conversationId', call.conversationId),
      q('callerId', String(call.callerId)),
      q('callerAvatar', call.callerAvatar ?? ''),
    ].join('&')
  );
}
