/**
 * iOS-часть FCM-пуша о звонке.
 * Если VoIP-пуш уже доставлен, звонок показывает CallKit, и обычный баннер «Входящий звонок»
 * с звуком только дублировал бы его — шлём тихий пуш с данными.
 */
export type CallApnsInput = {
  type: string;
  title: string;
  body: string;
  ttlSec: number;
  /** VoIP доставлен: баннер и звук не нужны. */
  iosSilent: boolean;
  nowSec?: number;
};

export type CallApnsConfig = {
  headers: Record<string, string>;
  payload: { aps: Record<string, unknown> };
};

export function buildCallApnsConfig(input: CallApnsInput): CallApnsConfig {
  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);
  const expiration = String(nowSec + input.ttlSec);
  const isIncoming = input.type === 'incoming_call';

  if (isIncoming && input.iosSilent) {
    return {
      // Фоновые пуши Apple принимает только с низким приоритетом.
      headers: { 'apns-priority': '5', 'apns-push-type': 'background', 'apns-expiration': expiration },
      payload: { aps: { contentAvailable: true } },
    };
  }

  return {
    headers: { 'apns-priority': '10', 'apns-push-type': 'alert', 'apns-expiration': expiration },
    payload: {
      aps: {
        // content-available помогает разбудить; CallKit на iOS идёт через VoIP отдельно
        contentAvailable: true,
        sound: isIncoming ? 'default' : undefined,
        alert: isIncoming && input.title ? { title: input.title, body: input.body } : undefined,
        category: isIncoming ? 'INCOMING_CALL' : undefined,
        interruptionLevel: 'time-sensitive',
      },
    },
  };
}
