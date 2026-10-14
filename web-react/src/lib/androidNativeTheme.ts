import { Capacitor } from '@capacitor/core';

/**
 * Оформление «Моя церковь» только для Android-приложения (Capacitor).
 * PWA в браузере и iOS остаются как есть: стили и шрифты подгружаются отдельным чанком
 * и включаются классом `app-android-native` на <html>.
 */
export function initAndroidNativeTheme(): void {
  if (typeof document === 'undefined') return;
  if (Capacitor.getPlatform() !== 'android') return;
  document.documentElement.classList.add('app-android-native');
  void import('../styles/androidNative');
}

/** Нативная оболочка Android (Capacitor): включает отдельную разметку там, где макет отличается от PWA. */
export function isAndroidNative(): boolean {
  return Capacitor.getPlatform() === 'android';
}
