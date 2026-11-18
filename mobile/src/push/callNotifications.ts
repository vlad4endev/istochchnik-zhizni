import { Platform } from 'react-native';

import {
  ACTION_ACCEPT,
  ACTION_DECLINE,
  CALL_CATEGORY_ID,
  CALL_CHANNEL_ID,
  buildIncomingNotification,
  callNotificationId,
  isRingExpired,
  parseCallPush,
} from '../lib/callPush';
import { callKitAvailable, callKitReportEnded } from '../lib/callKit';
import { getNotifications } from './pushNative';

/** Канал и кнопки «Принять/Отклонить» — готовим перед показом первого входящего. */
export async function ensureCallNotificationSetup(): Promise<boolean> {
  const N = getNotifications();
  if (!N) return false;
  try {
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync(CALL_CHANNEL_ID, {
        name: 'Звонки',
        description: 'Входящие аудио- и видеозвонки',
        importance: N.AndroidImportance.MAX,
        lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
        vibrationPattern: [0, 900, 700, 900, 700, 900],
        sound: 'default',
        enableVibrate: true,
        bypassDnd: false,
      });
      await N.setNotificationChannelAsync('default', {
        name: 'Уведомления',
        importance: N.AndroidImportance.HIGH,
      });
    }
    await N.setNotificationCategoryAsync(CALL_CATEGORY_ID, [
      { identifier: ACTION_ACCEPT, buttonTitle: 'Принять', options: { opensAppToForeground: true } },
      { identifier: ACTION_DECLINE, buttonTitle: 'Отклонить', options: { opensAppToForeground: true, isDestructive: true } },
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Обрабатывает данные пуша о звонке (в том числе когда приложение закрыто):
 * показывает «Входящий звонок» с кнопками или убирает его, если звонок закончился.
 * Возвращает, что было сделано, — это удобно для проверки.
 */
export async function handleCallPushData(
  data: Record<string, unknown> | undefined,
  sentTimeMs?: number | null,
  nowMs: number = Date.now(),
): Promise<'shown' | 'dismissed' | 'ignored' | 'expired' | 'unavailable' | 'callkit'> {
  const parsed = parseCallPush(data);
  if (!parsed) return 'ignored';
  // iPhone: входящий звонок показывает CallKit (по VoIP-пушу). Пуш о завершении закрывает его экран.
  if (callKitAvailable) {
    if (parsed.kind === 'ended') callKitReportEnded(parsed.callId);
    return 'callkit';
  }
  const N = getNotifications();
  if (!N) return 'unavailable';
  const identifier = callNotificationId(parsed.callId);

  if (parsed.kind === 'ended') {
    await N.dismissNotificationAsync(identifier).catch(() => undefined);
    return 'dismissed';
  }
  if (isRingExpired(sentTimeMs, nowMs)) return 'expired';
  if (!(await ensureCallNotificationSetup())) return 'unavailable';

  const content = buildIncomingNotification(parsed);
  await N.scheduleNotificationAsync({
    identifier,
    content: {
      title: content.title,
      body: content.body,
      data: content.data,
      categoryIdentifier: CALL_CATEGORY_ID,
      sound: 'default',
      priority: N.AndroidNotificationPriority.MAX,
      sticky: true,
      autoDismiss: false,
    },
    trigger: Platform.OS === 'android' ? { channelId: CALL_CHANNEL_ID } : null,
  });
  return 'shown';
}
