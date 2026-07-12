import { Button, Group, Paper, Text } from '@mantine/core';
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
    <Paper
      shadow="md"
      p="md"
      radius="md"
      withBorder
      style={{
        position: 'fixed',
        bottom: 'calc(var(--app-bottom-nav-total-height) + 8px)',
        left: 16,
        right: 16,
        zIndex: 10_000,
        maxWidth: 480,
        margin: '0 auto',
      }}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm" align="flex-start">
        <Text size="sm">Доступна новая версия приложения. Обновить сейчас?</Text>
        <Group gap="xs" wrap="nowrap">
          <Button
            variant="default"
            size="xs"
            onClick={() => {
              persistCooldown();
              setNeedRefresh(false);
            }}
            disabled={updateInProgress}
          >
            Позже
          </Button>
          <Button size="xs" onClick={onUpdateClick} loading={updateInProgress}>
            Обновить
          </Button>
        </Group>
      </Group>
    </Paper>
  );
}
