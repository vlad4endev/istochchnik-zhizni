/**
 * Каналы уведомлений Android.
 *
 * Свойства канала (звук, важность, показ на экране блокировки) система запоминает при первом
 * создании и приложение их больше не меняет. Приложение на Flutter создаёт свои каналы с суффиксом
 * `_v2` (звук, высокая важность, показ на экране блокировки), поэтому пуши на его устройства идут
 * в них. Старое приложение (Capacitor) остаётся на прежних каналах.
 */
export const FLUTTER_DEVICE_PREFIX = 'flutter-';

export type FcmChannelTarget = { token: string; deviceId: string | null };

export type FcmChannelGroup = { channelId: string; tokens: string[] };

export function isFlutterDevice(deviceId: string | null | undefined): boolean {
  return typeof deviceId === 'string' && deviceId.startsWith(FLUTTER_DEVICE_PREFIX);
}

/** Делит устройства на группы по каналу: прежние и приложение на Flutter (`<канал>_v2`). Пустые группы не возвращаются. */
export function groupFcmTargetsByChannel(targets: FcmChannelTarget[], baseChannelId: string): FcmChannelGroup[] {
  const legacy: string[] = [];
  const flutter: string[] = [];
  for (const t of targets) {
    (isFlutterDevice(t.deviceId) ? flutter : legacy).push(t.token);
  }
  const groups: FcmChannelGroup[] = [];
  if (legacy.length > 0) groups.push({ channelId: baseChannelId, tokens: legacy });
  if (flutter.length > 0) groups.push({ channelId: `${baseChannelId}_v2`, tokens: flutter });
  return groups;
}
