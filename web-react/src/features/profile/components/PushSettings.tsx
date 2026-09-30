import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { FiBell, FiBellOff } from 'react-icons/fi';
import { fetchPushStatus, sendTestPush, unsubscribeFromPushApi, type PushStatus } from '../api';
import { isAppleMobileWeb, isInstalledPwa } from '../../pwa/utils/pwaEnvironment';
import { useNotificationManager } from '../../pwa';
import { useAuthStore } from '../../auth/authStore';
import profileShell from '../profileShell.module.css';

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
        setMsg({ kind: 'err', text: 'Сервер не смог доставить уведомление. Выключите и включите уведомления заново.' });
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

  // Native Capacitor uses FCM via useFCM — this toggle is for browser / PWA only.
  if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
    return (
      <div className={profileShell.profileRoot} data-profile-root>
        <p className="text-sm text-[color:var(--profile-text-muted)]">
          Уведомления в приложении включаются через системный запрос при входе. Проверьте Настройки →
          Уведомления → Источник жизни.
        </p>
        {isParishioner ? (
          <p className="mt-2 text-xs text-[color:var(--profile-text-faint)]">
            Для роли «прихожанин» приходят: чаты, трансляции, лента (новые посты, лайки,
            комментарии, репосты), напоминание о молитве, дни рождения, новые проповеди и события.
            Служебные назначения координаторам не отправляются.
          </p>
        ) : null}
      </div>
    );
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
