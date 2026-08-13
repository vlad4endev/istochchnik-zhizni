import { LuBellOff } from 'react-icons/lu';

import { useDeviceNotificationPermission } from '../../../hooks/useDeviceNotificationPermission';
import {
  NOTIFICATION_PERMISSION_WIDGET_COPY,
  notificationPermissionSettingsHint,
  shouldShowNotificationPermissionWidget,
  type DeviceNotificationPermission,
} from '../../../lib/deviceNotificationPermission';

type ViewProps = {
  permission: Exclude<DeviceNotificationPermission, 'granted'>;
  busy: boolean;
  onAllow: () => void;
};

export function NotificationPermissionWidgetView({ permission, busy, onAllow }: ViewProps) {
  const denied = permission === 'denied';
  const unsupported = permission === 'unsupported';
  const copy = NOTIFICATION_PERMISSION_WIDGET_COPY;

  return (
    <section
      aria-label={copy.title}
      className={[
        'rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50 via-white to-orange-50/90',
        'p-4 shadow-[var(--shadow-card)] sm:p-5',
        'dark:border-amber-500/30 dark:from-amber-950/40 dark:via-[var(--surface-elevated)] dark:to-orange-950/30',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-500 text-white dark:bg-amber-600"
          aria-hidden
        >
          <LuBellOff className="h-5 w-5" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-amber-800 dark:text-amber-200">
            Устройство
          </p>
          <h2 className="mt-1 text-base font-extrabold leading-snug text-stone-900 dark:text-[var(--text)]">
            {copy.title}
          </h2>
          <p className="mt-2 text-sm font-medium leading-relaxed text-stone-700 dark:text-[var(--text-muted)]">
            {copy.body}
          </p>
          {denied ? (
            <p className="mt-2 text-sm font-semibold leading-relaxed text-amber-950 dark:text-amber-100">
              {notificationPermissionSettingsHint()}
            </p>
          ) : null}
          {unsupported ? (
            <p className="mt-2 text-sm font-semibold leading-relaxed text-amber-950 dark:text-amber-100">
              {copy.unsupportedHint}
            </p>
          ) : (
            <button
              type="button"
              onClick={onAllow}
              disabled={busy}
              className={[
                'mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-amber-600 px-4',
                'text-sm font-extrabold text-white shadow-sm transition',
                'hover:bg-amber-700 active:scale-[0.99] disabled:opacity-60 sm:w-auto',
                'dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-amber-950',
              ].join(' ')}
            >
              {busy ? 'Запрашиваем…' : copy.allowLabel}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/** Shown at the top of Home only when the device has not granted notification permission. */
export function NotificationPermissionWidget() {
  const { state, busy, request } = useDeviceNotificationPermission();

  if (!shouldShowNotificationPermissionWidget(state)) return null;

  return (
    <div className="pt-3 pb-1 sm:pt-4 lg:pt-4">
      <NotificationPermissionWidgetView
        permission={state}
        busy={busy}
        onAllow={() => {
          void request();
        }}
      />
    </div>
  );
}
