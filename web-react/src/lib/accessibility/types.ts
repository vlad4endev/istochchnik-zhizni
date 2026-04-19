export type AccessibilityColorTheme = 'standard' | 'dark' | 'high-contrast' | 'blue';

export type AccessibilityState = {
  colorTheme: AccessibilityColorTheme;
  /** 1 = 100%, 2 = 200% базового rem (16px) */
  fontScale: number;
  /** Межстрочный интервал (множитель) */
  lineHeight: number;
  monochrome: boolean;
  largeCursor: boolean;
  hideImages: boolean;
};
