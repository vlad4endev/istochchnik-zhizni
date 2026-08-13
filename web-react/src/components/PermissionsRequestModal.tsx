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
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6" role="presentation">
      <button
        type="button"
        aria-label="Закрыть окно разрешений"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={dismiss}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Разрешения приложения"
        className="relative z-[111] w-full max-w-[min(100%,24rem)] rounded-2xl border border-white/10 bg-zinc-900/90 px-5 py-5 text-zinc-100 shadow-2xl ring-1 ring-inset ring-white/10 backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[15px] font-extrabold tracking-tight text-white">
          Разрешите доступ
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-200/90">
          Для звонков, сообщений и уведомлений нужны разрешения:{' '}
          <span className="font-semibold">{needsText || 'камера, микрофон, уведомления'}</span>.
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
            className="w-full rounded-xl bg-white/14 py-3 text-[14px] font-extrabold text-white transition hover:bg-white/20 disabled:opacity-60"
          >
            {busy ? 'Запрашиваем…' : 'Разрешить'}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="w-full rounded-xl bg-white/6 py-3 text-[14px] font-semibold text-zinc-200 transition hover:bg-white/10"
          >
            Позже
          </button>
        </div>
      </div>
    </div>
  );
}
