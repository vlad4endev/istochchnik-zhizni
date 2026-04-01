import { useState } from 'react';
import { FiBell, FiBellOff } from 'react-icons/fi';
import { unsubscribeFromPushApi } from '../api';
import { useNotificationManager } from '../../pwa';

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
      <div className="mt-4 p-4 border border-stone-200 rounded-xl bg-stone-50">
        <p className="text-sm text-stone-500">
          Ваш браузер или устройство не поддерживает Push-уведомления (или приложение не добавлено на главный экран).
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-stone-100 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
            {isSubscribed ? (
              <FiBell className="w-4 h-4 text-teal-600" />
            ) : (
              <FiBellOff className="w-4 h-4 text-stone-400" />
            )}
            Push-уведомления
          </h3>
          <p className="text-sm text-stone-500 mt-1">
            Напоминания о ежедневной молитве и рассылка списков координаторам.
          </p>
        </div>
        
        <button
          type="button"
          onClick={() => void handleToggleSubscription()}
          disabled={loading}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
            isSubscribed ? 'bg-primary' : 'bg-stone-200'
          } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
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
