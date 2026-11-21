import type { IncomingCall } from '../stores/callStore';
import { decideIntent, type CallIntent } from '../lib/callPush';
import type { AnswerTarget } from '../lib/answerCall';

export type RunIntentDeps = {
  fetchStatus: (callId: string) => Promise<string | null>;
  decline: (callId: string) => Promise<void>;
  answer: (target: AnswerTarget) => Promise<string | null>;
  showIncoming: (call: IncomingCall) => void;
  /** Убрать системное уведомление о звонке. */
  dismissNative: (callId: string) => void;
  alert: (title: string, message: string) => void;
};

/**
 * Выполняет действие пользователя над входящим звонком (нажали на уведомление, «Принять» или «Отклонить»).
 * Сначала звонок проверяется на сервере: если он уже не звонит, ничего не принимается.
 */
export async function runCallIntent(intent: CallIntent, d: RunIntentDeps): Promise<void> {
  const decision = decideIntent(intent, await d.fetchStatus(intent.call.callId));
  d.dismissNative(intent.call.callId);

  if (decision.action === 'call-ended') {
    d.alert('Звонок', 'Звонок уже завершён.');
    return;
  }
  const c = decision.call;
  if (decision.action === 'decline') {
    await d.decline(c.callId).catch(() => undefined);
    return;
  }
  if (decision.action === 'show-incoming') {
    d.showIncoming({
      callId: c.callId,
      callerId: c.callerId,
      callerName: c.callerName,
      callerAvatar: c.callerAvatar,
      callType: c.callType,
      conversationId: c.conversationId,
    });
    return;
  }
  const err = await d.answer({
    callId: c.callId,
    callerName: c.callerName,
    callType: c.callType,
    conversationId: c.conversationId,
  });
  if (err) d.alert('Не удалось принять звонок', err);
}
