import { ActionIcon, Tooltip } from '@mantine/core';
import { IconMoon, IconSun } from '@tabler/icons-react';
import { useSyncExternalStore } from 'react';

import { useAppearanceStore } from '../stores/useAppearanceStore';

function readSystemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function subscribeSystemPrefersDark(onChange: () => void): () => void {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

export function ThemeToggle() {
  const theme = useAppearanceStore((s) => s.theme);
  const setTheme = useAppearanceStore((s) => s.setTheme);
  const systemDark = useSyncExternalStore(subscribeSystemPrefersDark, readSystemPrefersDark, () => false);

  const isDark =
    theme === 'dark' || (theme === 'system' && systemDark);

  return (
    <Tooltip label={isDark ? 'Светлая тема' : 'Тёмная тема'} withArrow>
      <ActionIcon
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        variant="default"
        size="lg"
        radius="sm"
        aria-label="Переключить светлую и тёмную тему"
      >
        {isDark ? <IconSun size={18} stroke={1.5} /> : <IconMoon size={18} stroke={1.5} />}
      </ActionIcon>
    </Tooltip>
  );
}
