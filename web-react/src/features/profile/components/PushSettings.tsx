import { useState } from 'react';
import { FiBell, FiBellOff } from 'react-icons/fi';
import { unsubscribeFromPushApi } from '../api';
import { useNotificationManager } from '../../pwa';
import profileShell from '../profileShell.module.css';

export function PushSettings() {
  const { isSubscribed, status, subscribe, loading: managerLoading, error: managerError, checkStatus } = useNotificationManager();
  const [localLoading, setLocalLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loading = managerLoading || localLoading;

  async function handleToggleSubscription() {
    setMsg(null);
    
    try {
      if (!isSubscribed) {
        const success = await subscribe();
        if (success) {
          setMsg({ kind: 'ok', text: 'Уведомления включены!' });
        } else if (managerError) {
          setMsg({ kind: 'err', text: managerError });
        }
      } else {
        setLocalLoading(true);
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await unsubscribeFromPushApi(subscription.endpoint);
          await subscription.unsubscribe();
        }
        await checkStatus();
        setMsg({ kind: 'ok', text: 'Уведомления отключены.' });
      }
    } catch (error: any) {
      console.error('Push Error:', error);
      setMsg({ kind: 'err', text: error.message || 'Произошла ошибка при настройке уведомлений' });
    } finally {
      setLocalLoading(false);
    }
  }

  if (status === 'unsupported') {
    return (
      <div className={profileShell.profileRoot} data-profile-root>
        <div className="mt-4 rounded-xl border border-[color:var(--profile-card-ring)] bg-[color:color-mix(in_srgb,var(--profile-surface-elevated)_70%,var(--profile-surface))] p-4">
          <p className="text-sm text-[color:var(--profile-text-muted)]">
            Ваш браузер или устройство не поддерживает Push-уведомления (или приложение не добавлено на главный экран).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${profileShell.profileRoot} mt-6 border-t border-[color:var(--profile-border-light)] pt-6`} data-profile-root>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-[color:var(--profile-text-heading)]">
            {isSubscribed ? (
              <FiBell className="h-4 w-4 text-teal-600" />
            ) : (
              <FiBellOff className="h-4 w-4 text-[color:var(--profile-text-faint)]" />
            )}
            Push-уведомления
          </h3>
          <p className="mt-1 text-sm text-[color:var(--profile-text-muted)]">
            Напоминания о ежедневной молитве и рассылка списков координаторам.
          </p>
        </div>
        
        <button
          type="button"
          onClick={() => void handleToggleSubscription()}
          disabled={loading}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[color:var(--profile-primary)] focus:ring-offset-2 ${
            isSubscribed ? 'bg-[color:var(--profile-primary)]' : 'bg-[color:var(--profile-media-placeholder)]'
          } ${loading ? 'cursor-not-allowed opacity-50' : ''}`}
          role="switch"
          aria-checked={isSubscribed}
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              isSubscribed ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {msg ? (
        <p
          className={`mt-3 text-sm font-medium ${
            msg.kind === 'ok' ? 'text-teal-700' : 'text-red-600'
          }`}
        >
          {msg.text}
        </p>
      ) : null}
      
      {status === 'denied' && (
        <p className="mt-3 text-xs text-red-500">
          Уведомления заблокированы в настройках браузера. Пожалуйста, разрешите их вручную для получения оповещений.
        </p>
      )}
    </div>
  );
}

