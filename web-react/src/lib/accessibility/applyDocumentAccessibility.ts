import type { AccessibilityState } from './types';
import { applySystemFontScaleToDocument } from './syncSystemFontScale';

export function applyAccessibilityToDocument(state: AccessibilityState): void {
  applySystemFontScaleToDocument();

  const root = document.documentElement;

  if (state.colorTheme === 'standard') {
    root.removeAttribute('data-color-theme');
  } else {
    root.setAttribute('data-color-theme', state.colorTheme);
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
