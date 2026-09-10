import { useAppearanceStore } from '../../stores/useAppearanceStore';
import type { AccessibilityState } from './types';

/**
 * Слот объявлен в index.html перед статичной парой `theme-color` с media: по
 * стандарту chrome берёт первый подходящий meta, поэтому именно этот элемент
 * определяет цвет статус-бара, когда тема приложения уже применена.
 *
 * Ветка с createElement оставлена для окружений без нашего index.html (jsdom в
 * тестах). Там элемент уезжает в конец head и приоритет уже не тот, но цвет
 * статус-бара в тестах никто не читает.
 */
function syncThemeColorMeta(isDarkLike: boolean): void {
  if (typeof document === 'undefined') return;
  const content = isDarkLike ? '#121214' : '#7d3640';
  let meta = document.querySelector('meta[name="theme-color"][data-app-managed="true"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('data-app-managed', 'true');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', content);
}

/**
 * Accessibility color theme is the single source of truth for dark-like modes.
 * Keeps `html.dark`, appearance store (Mantine), and theme-color meta in sync.
 */
export function applyAccessibilityToDocument(state: AccessibilityState): void {
  const root = document.documentElement;

  if (state.colorTheme === 'standard') {
    root.removeAttribute('data-color-theme');
  } else {
    root.setAttribute('data-color-theme', state.colorTheme);
  }

  const isDarkLike =
    state.colorTheme === 'dark' ||
    state.colorTheme === 'high-contrast' ||
    state.colorTheme === 'blue';

  if (isDarkLike) {
    root.classList.add('dark');
    root.classList.remove('theme-sepia');
  } else {
    root.classList.remove('dark');
    root.classList.remove('theme-sepia');
  }

  // Sync Zustand without calling setTheme() — avoids re-running applyTheme and fighting a11y.
  const appearanceTheme = isDarkLike ? 'dark' : 'light';
  if (useAppearanceStore.getState().theme !== appearanceTheme) {
    useAppearanceStore.setState({ theme: appearanceTheme });
  }

  syncThemeColorMeta(isDarkLike);

  root.style.setProperty('--a11y-font-scale', String(state.fontScale));
  root.style.setProperty('--a11y-line-height', String(state.lineHeight));

  if (state.monochrome) {
    root.setAttribute('data-a11y-monochrome', 'true');
  } else {
    root.removeAttribute('data-a11y-monochrome');
  }

  if (state.largeCursor) {
    root.setAttribute('data-a11y-large-cursor', 'true');
  } else {
    root.removeAttribute('data-a11y-large-cursor');
  }
}
