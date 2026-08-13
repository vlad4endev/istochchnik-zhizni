import {
  isCapacitorNative,
  queryNativePushPermission,
  requestNativePushPermission,
  type NativePermissionState,
} from './nativeApp';

export type DeviceNotificationPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export const NOTIFICATION_PERMISSION_CHANGED_EVENT = 'app:notification-permission-changed';
export const NOTIF_PROMPT_SESSION_DISMISSED_EVENT = 'app:notif-permission-prompt-session-dismissed';

/** Session-only: overlay prompts may hide until the next visit; the home widget stays. */
export const NOTIF_PROMPT_SESSION_DISMISS_KEY = 'app:notif-permission-prompt-dismissed:session';

export const NOTIFICATION_PERMISSION_WIDGET_COPY = {
  title: 'Нет разрешения на уведомления',
  body:
    'На этом устройстве не дано разрешение отправлять уведомления. Из‑за этого вы не получите сигнал, когда вам пишут в чате — сообщения не приходят на экран, если приложение закрыто. Многие из‑за этого пропускают переписку. Разрешите все уведомления в системе, чтобы сразу видеть новые сообщения.',
  allowLabel: 'Разрешить уведомления',
  unsupportedHint:
    'Этот браузер не умеет показывать уведомления. Установите приложение или добавьте сайт на экран «Домой», иначе вы не узнаете, когда пишут в чате.',
  settingsHintNative:
    'Разрешение уже отклонено. Откройте Настройки → Приложения → Источник жизни → Уведомления и включите все уведомления.',
  settingsHintWeb:
    'Разрешение уже отклонено в браузере. Откройте настройки сайта и разрешите уведомления для этого адреса, затем вернитесь в приложение.',
} as const;

export function normalizeDeviceNotificationPermission(
  state: NativePermissionState | NotificationPermission | string,
): DeviceNotificationPermission {
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'denied';
  if (state === 'default' || state === 'prompt') return 'default';
  return 'unsupported';
}

/** Widget and re-prompt: anything except an explicit grant. */
export function isMissingDeviceNotificationPermission(
  state: DeviceNotificationPermission,
): boolean {
  return state !== 'granted';
}

export function shouldShowNotificationPermissionWidget(
  state: DeviceNotificationPermission | 'loading',
): state is Exclude<DeviceNotificationPermission, 'granted'> {
  return state !== 'loading' && state !== 'granted';
}

export function wasNotificationPromptDismissedThisSession(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(NOTIF_PROMPT_SESSION_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function markNotificationPromptDismissedThisSession(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(NOTIF_PROMPT_SESSION_DISMISS_KEY, '1');
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NOTIF_PROMPT_SESSION_DISMISSED_EVENT));
  }
}

export function clearNotificationPromptSessionDismiss(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(NOTIF_PROMPT_SESSION_DISMISS_KEY);
  } catch {
    /* ignore */
  }
}

export function emitNotificationPermissionChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NOTIFICATION_PERMISSION_CHANGED_EVENT));
}

export async function queryDeviceNotificationPermission(): Promise<DeviceNotificationPermission> {
  if (typeof window === 'undefined') return 'unsupported';
  if (isCapacitorNative()) {
    const native = await queryNativePushPermission();
    const normalized = normalizeDeviceNotificationPermission(native);
    if (normalized !== 'unsupported') return normalized;
  }
  if (typeof Notification === 'undefined') return 'unsupported';
  return normalizeDeviceNotificationPermission(Notification.permission);
}

export async function requestDeviceNotificationPermission(): Promise<DeviceNotificationPermission> {
  if (typeof window === 'undefined') return 'unsupported';
  if (isCapacitorNative()) {
    const native = await requestNativePushPermission();
    const next = normalizeDeviceNotificationPermission(native);
    if (next === 'granted') clearNotificationPromptSessionDismiss();
    emitNotificationPermissionChanged();
    return next;
  }
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    const next = normalizeDeviceNotificationPermission(result);
    if (next === 'granted') clearNotificationPromptSessionDismiss();
    emitNotificationPermissionChanged();
    return next;
  } catch {
    const next = normalizeDeviceNotificationPermission(Notification.permission);
    emitNotificationPermissionChanged();
    return next;
  }
}

export function notificationPermissionSettingsHint(): string {
  if (isCapacitorNative()) return NOTIFICATION_PERMISSION_WIDGET_COPY.settingsHintNative;
  return NOTIFICATION_PERMISSION_WIDGET_COPY.settingsHintWeb;
}
