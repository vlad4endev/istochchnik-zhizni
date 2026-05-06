import type { MantineColorScheme, MantineColorSchemeManager } from '@mantine/core';

import { useAppearanceStore, type AppearanceTheme } from '../stores/useAppearanceStore';

function appearanceThemeToMantine(theme: AppearanceTheme): MantineColorScheme {
  if (theme === 'system') return 'auto';
  if (theme === 'dark') return 'dark';
  return 'light';
}

function mantineToAppearanceTheme(scheme: MantineColorScheme): AppearanceTheme {
  if (scheme === 'dark') return 'dark';
  if (scheme === 'light') return 'light';
  return 'system';
}

/**
 * Один источник правды — `useAppearanceStore` (классы на `html`, сепия, системная тема).
 * Не пишет `mantine-color-scheme-value` в localStorage.
 */
function createAppearanceColorSchemeManager(): MantineColorSchemeManager {
  let zustandUnsub: (() => void) | undefined;

  return {
    get: (_defaultValue: MantineColorScheme): MantineColorScheme =>
      appearanceThemeToMantine(useAppearanceStore.getState().theme),

    set: (value: MantineColorScheme) => {
      useAppearanceStore.getState().setTheme(mantineToAppearanceTheme(value));
    },

    subscribe: (onUpdate: (value: MantineColorScheme) => void) => {
      zustandUnsub?.();
      zustandUnsub = useAppearanceStore.subscribe((state, prevState) => {
        if (state.theme === prevState.theme) return;
        onUpdate(appearanceThemeToMantine(state.theme));
      });
    },

    unsubscribe: () => {
      zustandUnsub?.();
      zustandUnsub = undefined;
    },

    clear: () => {
      /* сброс темы — через настройки / appearance store */
    },
  };
}

export const appearanceColorSchemeManager = createAppearanceColorSchemeManager();
