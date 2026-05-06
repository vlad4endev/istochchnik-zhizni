import { ActionIcon, Tooltip } from '@mantine/core';
import { IconMoon, IconSun } from '@tabler/icons-react';
import { useAccessibilitySettings } from '@/lib/accessibility/AccessibilityProvider';

export function ThemeToggle() {
  const { state, patchA11y } = useAccessibilitySettings();
  const isDark = state.colorTheme !== 'standard';

  return (
    <Tooltip label={isDark ? 'Светлая тема' : 'Тёмная тема'} withArrow>
      <ActionIcon
        onClick={() => patchA11y({ colorTheme: isDark ? 'standard' : 'dark' })}
        variant="default"
        size="lg"
        radius="sm"
        aria-label="Переключить стандартную и тёмную тему"
      >
        {isDark ? <IconSun size={18} stroke={1.5} /> : <IconMoon size={18} stroke={1.5} />}
      </ActionIcon>
    </Tooltip>
  );
}
