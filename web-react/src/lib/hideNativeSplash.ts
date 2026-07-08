import { isCapacitorNative } from './nativeApp';

/**
 * Плавно скрывает нативный Capacitor splash после первого кадра веб-сплэша.
 * Плагин опционален — при отсутствии пакета просто no-op.
 */
export async function hideNativeSplash(): Promise<void> {
  if (!isCapacitorNative()) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 380 });
  } catch {
    // @capacitor/splash-screen не установлен или недоступен
  }
}

export function scheduleHideNativeSplashAfterPaint(): void {
  if (typeof window === 'undefined') return;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      void hideNativeSplash();
    });
  });
}
