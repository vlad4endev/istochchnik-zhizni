import { A11Y_DEFAULTS, A11Y_STORAGE_KEY } from './constants';
import type { AccessibilityColorTheme, AccessibilityState } from './types';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function isColorTheme(v: unknown): v is AccessibilityColorTheme {
  return v === 'standard' || v === 'dark' || v === 'high-contrast' || v === 'blue';
}

export function loadAccessibilityState(): AccessibilityState {
  try {
    const raw = localStorage.getItem(A11Y_STORAGE_KEY);
    if (!raw) return { ...A11Y_DEFAULTS };
    const p = JSON.parse(raw) as Partial<AccessibilityState>;
    return {
      colorTheme: isColorTheme(p.colorTheme) ? p.colorTheme : A11Y_DEFAULTS.colorTheme,
      fontScale: clamp(Number(p.fontScale) || A11Y_DEFAULTS.fontScale, 1, 2),
      lineHeight: clamp(Number(p.lineHeight) || A11Y_DEFAULTS.lineHeight, 1.2, 2.2),
      monochrome: Boolean(p.monochrome),
      largeCursor: Boolean(p.largeCursor),
      hideImages: Boolean(p.hideImages),
    };
  } catch {
    return { ...A11Y_DEFAULTS };
  }
}

export function saveAccessibilityState(state: AccessibilityState): void {
  try {
    localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode / quota */
  }
}
