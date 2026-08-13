import { useCallback, useEffect, useState } from 'react';

import {
  NOTIFICATION_PERMISSION_CHANGED_EVENT,
  isMissingDeviceNotificationPermission,
  queryDeviceNotificationPermission,
  requestDeviceNotificationPermission,
  type DeviceNotificationPermission,
} from '../lib/deviceNotificationPermission';
import { initMessengerPushNotifications } from '../features/messenger/push/webPush';
import { isCapacitorNative } from '../lib/nativeApp';

export type DeviceNotificationPermissionState = DeviceNotificationPermission | 'loading';

export function useDeviceNotificationPermission() {
  const [state, setState] = useState<DeviceNotificationPermissionState>('loading');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (): Promise<DeviceNotificationPermission> => {
    const next = await queryDeviceNotificationPermission();
    setState(next);
    return next;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    const onChanged = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener(NOTIFICATION_PERMISSION_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener(NOTIFICATION_PERMISSION_CHANGED_EVENT, onChanged);
    };
  }, [refresh]);

  const request = useCallback(async (): Promise<DeviceNotificationPermission> => {
    if (busy) return state === 'loading' ? 'default' : state;
    setBusy(true);
    try {
      const next = await requestDeviceNotificationPermission();
      setState(next);
      if (next === 'granted' && !isCapacitorNative()) {
        try {
          await initMessengerPushNotifications({ force: true });
        } catch {
          /* permission is granted; Layout useWebPushSync retries the subscription */
        }
      }
      return next;
    } finally {
      setBusy(false);
    }
  }, [busy, state]);

  const missing = state !== 'loading' && isMissingDeviceNotificationPermission(state);

  return { state, busy, missing, request, refresh };
}
