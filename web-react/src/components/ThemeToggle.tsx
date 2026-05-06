import { ActionIcon, Tooltip, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { IconMoon, IconSun } from '@tabler/icons-react';

export function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const isDark = computed === 'dark';

  return (
    <Tooltip label={isDark ? 'Светлая тема' : 'Темная тема'} withArrow>
      <ActionIcon
        onClick={() => setColorScheme(isDark ? 'light' : 'dark')}
        variant="default"
        size="lg"
        radius="sm"
        aria-label="Toggle color scheme"
      >
        {isDark ? <IconSun size={18} stroke={1.5} /> : <IconMoon size={18} stroke={1.5} />}
      </ActionIcon>
    </Tooltip>
  );
}
