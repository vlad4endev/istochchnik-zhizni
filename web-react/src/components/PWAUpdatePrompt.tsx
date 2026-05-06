import { Button, Group, Paper, Text } from '@mantine/core';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Показ при registerType: 'prompt' — пользователь сам решает, когда активировать новый SW.
 */
export function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisterError(error) {
      console.warn('SW registration failed:', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <Paper
      shadow="md"
      p="md"
      radius="md"
      withBorder
      style={{
        position: 'fixed',
        bottom: 16,
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
          <Button variant="default" size="xs" onClick={() => setNeedRefresh(false)}>
            Позже
          </Button>
          <Button size="xs" onClick={() => void updateServiceWorker(true)}>
            Обновить
          </Button>
        </Group>
      </Group>
    </Paper>
  );
}
