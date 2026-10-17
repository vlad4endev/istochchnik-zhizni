import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { FiBell, FiBellOff } from 'react-icons/fi';
import { fetchPushStatus, sendTestPush, unsubscribeFromPushApi, type PushStatus } from '../api';
import { isAppleMobileWeb, isInstalledPwa } from '../../pwa/utils/pwaEnvironment';
import { useNotificationManager } from '../../pwa';
import { useAuthStore } from '../../auth/authStore';
import { initMessengerPushNotifications } from '../../messenger/push/webPush';
import { useDeviceNotificationPermission } from '../../../hooks/useDeviceNotificationPermission';
import { openNativeNotificationSettings } from '../../../lib/nativeApp';
import { notificationPermissionSettingsHint } from '../../../lib/deviceNotificationPermission';
import profileShell from '../profileShell.module.css';

const FCM_ERROR_HINTS: Record<string, string> = {
  'messaging/third-party-auth-error':
    'Firebase не принимает ключ APNs (iOS): загрузите APNs Auth Key в Firebase → Cloud Messaging.',
  'messaging/registration-token-not-registered': 'Устройство удалено из Firebase — переподключите уведомления.',
  'messaging/invalid-argument': 'Firebase отклонил сообщение (неверный токен или формат).',
  'messaging/mismatched-credential': 'Ключ сервера Firebase относится к другому проекту, чем приложение.',
  'messaging/unavailable': 'Firebase временно недоступен, повторите через минуту.',
};

function describePushFailure(errors: string[] | undefined): string {
  const known = (errors ?? []).map((c) => FCM_ERROR_HINTS[c]).filter(Boolean);
  if (known.length > 0) return known.join(' ');
  const codes = (errors ?? []).filter((c) => c !== 'unknown');
  return codes.length > 0
    ? `Сервер не смог доставить уведомление (${codes.join(', ')}). Переподключите уведомления.`
    : 'Сервер не смог доставить уведомление. Выключите и включите уведомления заново.';
}

function NativePushSettings({ isParishioner }: { isParishioner: boolean }) {
  const { state, busy, request, refresh } = useDeviceNotificationPermission();
  const [serverStatus, setServerStatus] = useState<PushStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setServerStatus(await fetchPushStatus());
    } catch {
      setServerStatus(null);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    const onRegistered = () => void loadStatus();
    window.addEventListener('app:native-push-registered', onRegistered);
    return () => window.removeEventListener('app:native-push-registered', onRegistered);
  }, [loadStatus]);

  const granted = state === 'granted';
  const denied = state === 'denied';
  const registered = (serverStatus?.nativeDevices ?? 0) > 0;

  async function openSettings() {
    const ok = await openNativeNotificationSettings();
    if (!ok) setMsg({ kind: 'err', text: notificationPermissionSettingsHint() });
  }

  async function handleEnable() {
    setMsg(null);
    const next = await request();
    if (next === 'granted') {
      window.dispatchEvent(new CustomEvent('app:native-push-permissions-granted'));
      setMsg({ kind: 'ok', text: 'Разрешение получено, подключаем устройство…' });
      window.setTimeout(() => void loadStatus(), 2500);
      return;
    }
    // После отказа система больше не показывает запрос — ведём в настройки.
    setMsg({ kind: 'err', text: notificationPermissionSettingsHint() });
    await openSettings();
  }

  function handleReconnect() {
    setMsg({ kind: 'ok', text: 'Переподключаем устройство…' });
    window.dispatchEvent(new CustomEvent('app:native-push-permissions-granted'));
    window.setTimeout(() => {
      void loadStatus();
      void refresh();
    }, 2500);
  }

  async function handleTest() {
    setMsg(null);
    setTesting(true);
    try {
      const summary = await sendTestPush();
      const sent = summary.web.sent + summary.fcm.sent;
      const attempted = summary.web.attempted + summary.fcm.attempted;
      if (attempted === 0) {
        setMsg({ kind: 'err', text: 'Устройство не зарегистрировано на сервере. Нажмите «Переподключить».' });
      } else if (sent === 0) {
        setMsg({ kind: 'err', text: describePushFailure([...(summary.fcm.errors ?? []), ...(summary.web.errors ?? [])]) });
      } else {
        setMsg({ kind: 'ok', text: `Тест отправлен на устройств: ${sent}. Уведомление придёт через несколько секунд.` });
      }
      void loadStatus();
    } catch (e) {
      const code = (e as { response?: { status?: number } })?.response?.status;
      setMsg({
        kind: 'err',
        text: code === 429 ? 'Подождите несколько секунд перед повторной проверкой.' : 'Не удалось отправить тест.',
      });
    } finally {
      setTesting(false);
    }
  }

  const btn =
    'rounded-lg border border-[color:var(--profile-card-ring)] px-3 py-1.5 text-xs font-semibold text-[color:var(--profile-text-heading)] disabled:opacity-50';

  return (
    <div className={profileShell.profileRoot} data-profile-root>
      <h3 className="flex items-center gap-2 text-sm font-bold text-[color:var(--profile-text-heading)]">
        {granted && registered ? (
          <FiBell className="h-4 w-4 text-teal-600" aria-hidden />
        ) : (
          <FiBellOff className="h-4 w-4 text-[color:var(--profile-text-faint)]" aria-hidden />
        )}
        Push-уведомления
      </h3>
      <p className="mt-1 text-sm text-[color:var(--profile-text-muted)]">
        {state === 'loading'
          ? 'Проверяем разрешение…'
          : granted
            ? registered
              ? 'Включены: сообщения, трансляции и напоминания приходят даже когда приложение закрыто.'
              : 'Разрешение есть, но устройство ещё не подключено к серверу. Нажмите «Переподключить».'
            : denied
              ? 'Уведомления запрещены в настройках телефона. Откройте настройки и включите их для приложения.'
              : 'Разрешите уведомления, чтобы получать сообщения и напоминания.'}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!granted && !denied ? (
          <button type="button" onClick={() => void handleEnable()} disabled={busy} className={btn}>
            {busy ? 'Запрос…' : 'Включить уведомления'}
          </button>
        ) : null}
        {denied || (!granted && state !== 'loading') ? (
          <button type="button" onClick={() => void openSettings()} className={btn}>
            Открыть настройки телефона
          </button>
        ) : null}
        {granted ? (
          <>
            <button type="button" onClick={handleReconnect} className={btn}>
              Переподключить
            </button>
            <button type="button" onClick={() => void handleTest()} disabled={testing} className={btn}>
              {testing ? 'Отправка…' : 'Отправить тест'}
            </button>
          </>
        ) : null}
      </div>

      {serverStatus && !serverStatus.fcmConfigured ? (
        <p className="mt-2 text-xs text-red-600">Сервер не настроен для push на телефоны (Firebase).</p>
      ) : null}
      {msg ? (
        <p className={`mt-3 text-sm font-medium ${msg.kind === 'ok' ? 'text-teal-700' : 'text-red-600'}`}>
          {msg.text}
        </p>
      ) : null}
      {isParishioner ? (
        <p className="mt-2 text-xs text-[color:var(--profile-text-faint)]">
          Для роли «прихожанин» приходят: чаты, трансляции, лента (новые посты, лайки, комментарии, репосты),
          напоминание о молитве, дни рождения, новые проповеди и события. Служебные назначения координаторам не
          отправляются.
        </p>
      ) : null}
    </div>
  );
}

export function PushSettings() {
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles);
  const isParishioner =
    role === 'parishioner' || (Array.isArray(roles) && roles.includes('parishioner'));

  const {
    isSubscribed,
    status,
    subscribe,
    loading: managerLoading,
    error: managerError,
    checkStatus,
  } = useNotificationManager();
  const [localLoading, setLocalLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [serverStatus, setServerStatus] = useState<PushStatus | null>(null);
  const [testing, setTesting] = useState(false);

  const refreshServerStatus = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker?.ready;
      const sub = await registration?.pushManager.getSubscription();
      setServerStatus(await fetchPushStatus(sub?.endpoint));
    } catch {
      setServerStatus(null);
    }
  }, []);

  useEffect(() => {
    if (Capacitor.isNativePlatform() || status === 'unsupported') return;
    void refreshServerStatus();
  }, [status, isSubscribed, refreshServerStatus]);

  // Браузер подписан, а сервер своей записи не знает (удалена по 410/ротации) — чиним сами, один раз.
  const healedRef = useRef(false);
  useEffect(() => {
    if (healedRef.current) return;
    if (!isSubscribed || serverStatus?.currentEndpointRegistered !== false) return;
    healedRef.current = true;
    void initMessengerPushNotifications({ force: true }).then(() => refreshServerStatus());
  }, [isSubscribed, serverStatus, refreshServerStatus]);

  async function handleTestPush() {
    setMsg(null);
    setTesting(true);
    try {
      const summary = await sendTestPush();
      const sent = summary.web.sent + summary.fcm.sent;
      const attempted = summary.web.attempted + summary.fcm.attempted;
      if (attempted === 0) {
        setMsg({ kind: 'err', text: 'На сервере нет ни одной подписки. Включите уведомления переключателем выше.' });
      } else if (sent === 0) {
        setMsg({ kind: 'err', text: describePushFailure([...(summary.web.errors ?? []), ...(summary.fcm.errors ?? [])]) });
      } else {
        setMsg({ kind: 'ok', text: `Тест отправлен на устройств: ${sent}. Уведомление должно появиться через несколько секунд.` });
      }
      void refreshServerStatus();
    } catch (e) {
      const code = (e as { response?: { status?: number } })?.response?.status;
      setMsg({
        kind: 'err',
        text: code === 429 ? 'Подождите несколько секунд перед повторной проверкой.' : 'Не удалось отправить тест.',
      });
    } finally {
      setTesting(false);
    }
  }

  // Native Capacitor uses FCM via useFCM — отдельная панель со статусом и ссылкой в настройки телефона.
  if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
    return <NativePushSettings isParishioner={isParishioner} />;
  }

  const loading = managerLoading || localLoading;

  async function handleToggleSubscription() {
    setMsg(null);

    try {
      if (!isSubscribed) {
        const result = await subscribe();
        if (result.ok) {
          setMsg({ kind: 'ok', text: 'Уведомления включены.' });
        } else {
          setMsg({
            kind: 'err',
            text:
              result.error?.trim() ||
              managerError?.trim() ||
              'Не удалось включить уведомления. Проверьте интернет и повторите.',
          });
        }
      } else {
        setLocalLoading(true);
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          try {
            await unsubscribeFromPushApi(subscription.endpoint);
          } catch (e) {
            console.error('Failed to report unsubscribe to backend', e);
          }
          await subscription.unsubscribe();
        }
        await checkStatus();
        void refreshServerStatus();
        setMsg({ kind: 'ok', text: 'Уведомления отключены.' });
      }
    } catch (error: unknown) {
      console.error('Push Error:', error);
      const text =
        error instanceof Error && error.message
          ? error.message
          : 'Произошла ошибка при настройке уведомлений';
      setMsg({ kind: 'err', text });
    } finally {
      setLocalLoading(false);
    }
  }

  if (status === 'unsupported') {
    return (
      <div className={profileShell.profileRoot} data-profile-root>
        <div className="mt-4 rounded-xl border border-[color:var(--profile-card-ring)] bg-[color:color-mix(in_srgb,var(--profile-surface-elevated)_70%,var(--profile-surface))] p-4">
          <p className="text-sm text-[color:var(--profile-text-muted)]">
            {isAppleMobileWeb() && !isInstalledPwa()
              ? 'На iPhone и iPad push работают только в установленном приложении: нажмите «Поделиться» → «На экран „Домой“», затем откройте ярлык и включите уведомления здесь (нужен iOS 16.4 или новее).'
              : 'Браузер не поддерживает Push-уведомления. На iPhone добавьте сайт на экран «Домой» и откройте ярлык.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${profileShell.profileRoot} mt-0 border-0 pt-0 !bg-transparent`} data-profile-root>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[color:var(--profile-text-heading)]">
            {isSubscribed ? (
              <FiBell className="h-4 w-4 text-teal-600" aria-hidden />
            ) : (
              <FiBellOff className="h-4 w-4 text-[color:var(--profile-text-faint)]" aria-hidden />
            )}
            Push-уведомления
          </h3>
          <p className="mt-1 text-sm text-[color:var(--profile-text-muted)]">
            Сообщения в чатах, трансляции и напоминания — даже когда вкладка закрыта.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleToggleSubscription()}
          disabled={loading || status === 'denied'}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[color:var(--profile-primary)] focus:ring-offset-2 ${
            isSubscribed
              ? 'bg-[color:var(--profile-primary)]'
              : 'bg-[color:color-mix(in_srgb,var(--profile-text-faint)_45%,transparent)]'
          } ${loading || status === 'denied' ? 'cursor-not-allowed opacity-50' : ''}`}
          role="switch"
          aria-checked={isSubscribed}
          aria-label={isSubscribed ? 'Отключить push-уведомления' : 'Включить push-уведомления'}
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              isSubscribed ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {isParishioner ? (
        <p className="mt-3 text-xs text-[color:var(--profile-text-faint)]">
          Роль «прихожанин»: чаты, трансляции, лента (новые посты, лайки, комментарии, репосты),
          молитва, дни рождения, проповеди и события. Служебные назначения координаторам не приходят.
        </p>
      ) : null}

      {msg ? (
        <p
          className={`mt-3 text-sm font-medium ${
            msg.kind === 'ok' ? 'text-teal-700' : 'text-red-600'
          }`}
        >
          {msg.text}
        </p>
      ) : null}

      {isSubscribed && serverStatus ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[color:var(--profile-text-muted)]">
          {!serverStatus.vapidConfigured ? (
            <span className="text-red-600">Сервер push не настроен (VAPID).</span>
          ) : serverStatus.currentEndpointRegistered === false ? (
            <span className="text-amber-600">Это устройство не зарегистрировано на сервере — переключите уведомления.</span>
          ) : (
            <span>Устройств с уведомлениями: {serverStatus.webSubscriptions + serverStatus.nativeDevices}</span>
          )}
          <button
            type="button"
            onClick={() => void handleTestPush()}
            disabled={testing || loading}
            className="rounded-lg border border-[color:var(--profile-card-ring)] px-3 py-1.5 text-xs font-semibold text-[color:var(--profile-text-heading)] disabled:opacity-50"
          >
            {testing ? 'Отправка…' : 'Отправить тест'}
          </button>
        </div>
      ) : null}

      {status === 'denied' ? (
        <p className="mt-3 text-xs text-red-500">
          Уведомления заблокированы в настройках браузера. Разрешите их для этого сайта вручную, затем
          обновите страницу.
        </p>
      ) : null}
    </div>
  );
}
