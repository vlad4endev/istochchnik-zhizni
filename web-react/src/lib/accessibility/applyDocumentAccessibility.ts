import type { AccessibilityState } from './types';

export function applyAccessibilityToDocument(state: AccessibilityState): void {
  const root = document.documentElement;

  if (state.colorTheme === 'standard') {
    root.removeAttribute('data-color-theme');
  } else {
    root.setAttribute('data-color-theme', state.colorTheme);
  }

  // Accessibility color theme is the single source of truth for dark-like modes.
  // Keep legacy `html.dark` selectors in sync to avoid split-theme states.
  const isDarkLike =
    state.colorTheme === 'dark' ||
    state.colorTheme === 'high-contrast' ||
    state.colorTheme === 'blue';
  if (isDarkLike) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
    root.classList.remove('theme-sepia');
  }

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
