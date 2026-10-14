import { useEffect, useMemo, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Показ при registerType: 'prompt' — пользователь сам решает, когда активировать новый SW.
 */
export function PWAUpdatePrompt() {
  const DISMISS_KEY = 'pwa:update-prompt:dismissed-until';
  const UPDATE_CLICK_COOLDOWN_MS = 10 * 60 * 1000;
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisterError(error) {
      console.warn('SW registration failed:', error);
    },
  });
  const [updateInProgress, setUpdateInProgress] = useState(false);

  const dismissedUntil = useMemo(() => {
    try {
      const raw = sessionStorage.getItem(DISMISS_KEY);
      const n = raw ? Number.parseInt(raw, 10) : 0;
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }, []);

  const hiddenByCooldown = dismissedUntil > Date.now();

  useEffect(() => {
    if (!needRefresh || !hiddenByCooldown) return;
    setNeedRefresh(false);
  }, [hiddenByCooldown, needRefresh, setNeedRefresh]);

  const persistCooldown = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, String(Date.now() + UPDATE_CLICK_COOLDOWN_MS));
    } catch {
      /* ignore storage issues */
    }
  };

  const onUpdateClick = () => {
    setUpdateInProgress(true);
    setNeedRefresh(false);
    persistCooldown();
    void updateServiceWorker(true).catch((error) => {
      console.warn('SW update trigger failed:', error);
      setUpdateInProgress(false);
    });
  };

  if (!needRefresh || hiddenByCooldown) return null;

  return (
    <div
      className="app-card fixed left-4 right-4 z-[10000] mx-auto flex max-w-md flex-col gap-3 p-4"
      style={{ bottom: 'calc(var(--app-bottom-nav-total-height) + 8px)' }}
      role="status"
    >
      <p className="font-ui text-sm font-medium leading-snug text-ink">
        Доступна новая версия приложения. Обновить сейчас?
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="app-btn-ghost min-h-[44px] flex-1 !min-h-[44px] px-3 text-sm"
          onClick={() => {
            persistCooldown();
            setNeedRefresh(false);
          }}
          disabled={updateInProgress}
        >
          Позже
        </button>
        <button
          type="button"
          className="app-btn-primary min-h-[44px] flex-1 !min-h-[44px] px-3 text-sm disabled:opacity-60"
          onClick={onUpdateClick}
          disabled={updateInProgress}
        >
          {updateInProgress ? 'Обновляем…' : 'Обновить'}
        </button>
      </div>
    </div>
  );
}
