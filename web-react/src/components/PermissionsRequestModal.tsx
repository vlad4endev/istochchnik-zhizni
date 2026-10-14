import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { emitAppToast } from '../lib/uiFeedback';
import {
  isCapacitorNative,
  type NativePermissionState,
} from '../lib/nativeApp';
import { useAuthStore } from '../features/auth/authStore';
import {
  NOTIFICATION_PERMISSION_CHANGED_EVENT,
  isMissingDeviceNotificationPermission,
  markNotificationPromptDismissedThisSession,
  queryDeviceNotificationPermission,
  requestDeviceNotificationPermission,
  wasNotificationPromptDismissedThisSession,
  type DeviceNotificationPermission,
} from '../lib/deviceNotificationPermission';
import { BodyPortal } from './BodyPortal';

type PermissionStateLike = NativePermissionState;

/** Permanent skip for camera/mic only. Notifications are re-prompted each visit until granted. */
const LS_CAM_MIC_DISMISSED_KEY = 'app:permissions-prompt-dismissed:v1';

async function queryPermission(name: 'camera' | 'microphone'): Promise<PermissionStateLike> {
  const perms = (navigator as Navigator & { permissions?: Permissions })?.permissions;
  if (!perms?.query) return 'unknown';
  try {
    const res = await perms.query(({ name } as unknown) as PermissionDescriptor);
    return (res?.state as PermissionStateLike) ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function PermissionsRequestModal() {
  const token = useAuthStore((s) => s.token);
  const [open, setOpen] = useState(false);
  const [cam, setCam] = useState<PermissionStateLike>('unknown');
  const [mic, setMic] = useState<PermissionStateLike>('unknown');
  const [notif, setNotif] = useState<DeviceNotificationPermission>('default');
  const [busy, setBusy] = useState(false);
  const camMicDismissedRef = useRef(false);

  useEffect(() => {
    if (!token) return;
    try {
      camMicDismissedRef.current = localStorage.getItem(LS_CAM_MIC_DISMISSED_KEY) === '1';
    } catch {
      camMicDismissedRef.current = false;
    }
  }, [token]);

  const evaluate = useCallback(async () => {
    const [c, m, n] = await Promise.all([
      queryPermission('camera'),
      queryPermission('microphone'),
      queryDeviceNotificationPermission(),
    ]);
    setCam(c);
    setMic(m);
    setNotif(n);
    const needsCamMic = !camMicDismissedRef.current && (c !== 'granted' || m !== 'granted');
    const needsNotif =
      isMissingDeviceNotificationPermission(n) && !wasNotificationPromptDismissedThisSession();
    setOpen(needsCamMic || needsNotif);
  }, []);

  useEffect(() => {
    if (!token) {
      setOpen(false);
      return;
    }
    void evaluate();
  }, [token, evaluate]);

  useEffect(() => {
    if (!token) return;
    const onChanged = () => {
      void evaluate();
    };
    window.addEventListener('focus', onChanged);
    window.addEventListener(NOTIFICATION_PERMISSION_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener('focus', onChanged);
      window.removeEventListener(NOTIFICATION_PERMISSION_CHANGED_EVENT, onChanged);
    };
  }, [token, evaluate]);

  const needsText = useMemo(() => {
    const missing: string[] = [];
    if (cam !== 'granted') missing.push('камера');
    if (mic !== 'granted') missing.push('микрофон');
    if (isMissingDeviceNotificationPermission(notif)) missing.push('уведомления');
    return missing.length > 0 ? missing.join(', ') : '';
  }, [cam, mic, notif]);

  const dismiss = useCallback(() => {
    setOpen(false);
    markNotificationPromptDismissedThisSession();
    try {
      localStorage.setItem(LS_CAM_MIC_DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  const requestAll = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach((t) => t.stop());
      }

      const n = await requestDeviceNotificationPermission();

      const [c, m] = await Promise.all([queryPermission('camera'), queryPermission('microphone')]);
      setCam(c);
      setMic(m);
      setNotif(n);

      const ok = c === 'granted' && m === 'granted' && n === 'granted';
      if (ok) {
        emitAppToast('Разрешения получены', 'success');
        dismiss();
      } else if (n !== 'granted') {
        emitAppToast(
          isCapacitorNative()
            ? 'Без уведомлений на устройстве вы не узнаете, когда пишут в чате. Настройки → Приложения → Источник жизни → Уведомления.'
            : 'Без уведомлений вы не узнаете, когда пишут в чате. Разрешите их в настройках сайта.',
          'error',
        );
      } else if (isCapacitorNative()) {
        emitAppToast(
          'Не все разрешения выданы. Откройте Настройки → Приложения → Источник жизни → Разрешения.',
          'error',
        );
      } else {
        emitAppToast('Разрешения не выданы. Проверьте настройки браузера.', 'error');
      }
    } catch (e) {
      const name = e && typeof e === 'object' && 'name' in e ? String((e as { name?: unknown }).name) : '';
      if (name === 'NotAllowedError') {
        emitAppToast(
          isCapacitorNative()
            ? 'Доступ запрещён. Разрешите камеру и микрофон в настройках Android.'
            : 'Доступ к камере/микрофону запрещён. Разрешите в настройках сайта.',
          'error',
        );
      } else if (name === 'NotFoundError') {
        emitAppToast('Камера или микрофон не найдены.', 'error');
      } else if (name === 'NotReadableError') {
        emitAppToast('Камера/микрофон заняты другим приложением.', 'error');
      } else {
        emitAppToast('Не удалось запросить разрешения.', 'error');
      }
    } finally {
      setBusy(false);
    }
  }, [busy, dismiss]);

  if (!open) return null;

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[110] flex items-end justify-center max-phone:p-0 p-6 sm:items-center" role="presentation">
        <button
          type="button"
          aria-label="Закрыть окно разрешений"
          className="absolute inset-0 bg-[rgba(35,8,16,0.5)] backdrop-blur-[2px]"
          onClick={dismiss}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Разрешения приложения"
          className="relative z-[111] w-full max-w-[min(100%,24rem)] rounded-t-leaf bg-card px-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-4 text-ink shadow-sheet max-phone:rounded-b-none sm:rounded-card sm:pb-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[color:var(--border-hover)] max-phone:block hidden" aria-hidden />
          <p className="font-ui text-[17px] font-extrabold tracking-tight text-ink">Разрешите доступ</p>
          <p className="mt-2 font-ui text-[13px] leading-relaxed text-muted">
            Для звонков, сообщений и уведомлений нужны разрешения:{' '}
            <span className="font-semibold text-ink">{needsText || 'камера, микрофон, уведомления'}</span>.
            {isMissingDeviceNotificationPermission(notif) ? (
              <>
                {' '}
                Без разрешения на уведомления на устройстве вы не получите сигнал, когда вам пишут в чате.
              </>
            ) : null}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void requestAll()}
              disabled={busy}
              className="app-btn-primary w-full disabled:opacity-60"
            >
              {busy ? 'Запрашиваем…' : 'Разрешить'}
            </button>
            <button type="button" onClick={dismiss} className="app-btn-ghost w-full">
              Позже
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
