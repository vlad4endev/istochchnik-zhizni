import { native } from '../../modules/expo-callscreen/src';
import { DEFAULT_RING_TTL_SEC, type IncomingCallPush } from './callPush';

/** Полноэкранный звонок есть только в сборке для Android. В Expo Go и на iPhone всё ниже — безопасные «пустышки». */
export const callScreenAvailable: boolean = native != null;

/** Показать полноэкранное уведомление о звонке. Возвращает false, если уведомления запрещены. */
export function showIncomingCallScreen(call: IncomingCallPush, ttlSec: number = DEFAULT_RING_TTL_SEC): boolean {
  try {
    return (
      native?.showIncomingCall(
        call.callId,
        call.callerName,
        call.callType,
        call.conversationId,
        String(call.callerId),
        call.callerAvatar ?? '',
        ttlSec,
      ) ?? false
    );
  } catch {
    return false;
  }
}

/** Убрать уведомление о звонке (ответили, отклонили или звонок закончился). */
export function dismissIncomingCallScreen(callId: string): void {
  try {
    native?.dismissIncomingCall(callId);
  } catch {
    /* уведомления уже нет */
  }
}

/** Показывать приложение поверх экрана блокировки: только пока звонит входящий. */
export function setShowOverLockScreen(enabled: boolean): void {
  try {
    native?.setShowOverLockScreen(enabled);
  } catch {
    /* окно приложения ещё не готово */
  }
}

/** Разрешено ли приложению открываться на весь экран по звонку (на Android 14+ это можно отозвать). */
export function fullScreenAllowed(): boolean {
  try {
    return native?.canUseFullScreenIntent() ?? true;
  } catch {
    return true;
  }
}

export function openFullScreenSettings(): void {
  try {
    native?.openFullScreenIntentSettings();
  } catch {
    /* настройки недоступны */
  }
}

/** Нужно ли один раз объяснить пользователю, как включить полноэкранные звонки. */
export function shouldPromptFullScreen(input: { available: boolean; allowed: boolean; alreadyPrompted: boolean }): boolean {
  return input.available && !input.allowed && !input.alreadyPrompted;
}
