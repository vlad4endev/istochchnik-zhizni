import { native, type CallKitEndReason } from '../../modules/expo-callkit/src';

/** CallKit есть только в сборке для iPhone. В Expo Go и на Android всё ниже — безопасные «пустышки». */
export const callKitAvailable: boolean = native != null;

/** Звонки, которые уже показывает системный экран iOS: наш экран «Входящий» для них не нужен. */
const reported = new Set<string>();

export function markCallKitReported(callId: string): void {
  if (callId) reported.add(callId);
}

export function isCallKitReported(callId: string): boolean {
  return reported.has(callId);
}

export function forgetCallKitReported(callId: string): void {
  reported.delete(callId);
}

/** Показывает ли система этот звонок прямо сейчас. */
export function callKitHas(callId: string): boolean {
  try {
    return native?.isCallActive(callId) ?? false;
  } catch {
    return false;
  }
}

/** Звонок закончился не по действию пользователя (сбросил собеседник): убрать его с системного экрана. */
export function callKitReportEnded(callId: string, reason: CallKitEndReason = 'remoteEnded'): void {
  try {
    native?.reportCallEnded(callId, reason);
  } catch {
    /* системный экран уже закрыт */
  }
  forgetCallKitReported(callId);
}

/** Пользователь завершил звонок в нашем интерфейсе: сообщаем системе, чтобы она закрыла свой экран. */
export async function callKitRequestEnd(callId: string): Promise<void> {
  try {
    await native?.requestEndCall(callId);
  } catch {
    /* ничего не делаем: звонок уже закрыт */
  }
  forgetCallKitReported(callId);
}
