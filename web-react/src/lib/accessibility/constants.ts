import type { AccessibilityState } from './types';

export const A11Y_STORAGE_KEY = 'istoch-life-a11y-v1';

export const A11Y_DEFAULTS: AccessibilityState = {
  colorTheme: 'standard',
  fontScale: 1,
  lineHeight: 1.55,
  monochrome: false,
  largeCursor: false,
  hideImages: false,
};

export const A11Y_FONT_MIN = 1;
export const A11Y_FONT_MAX = 2;
export const A11Y_FONT_STEP = 0.05;

export const A11Y_LINE_MIN = 1.2;
export const A11Y_LINE_MAX = 2.2;
export const A11Y_LINE_STEP = 0.05;
