const LOCKED_VIEWPORT =
  'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no';

/**
 * Фиксирует viewport: без pinch / double-tap zoom в мобильном браузере и в PWA.
 * Масштаб интерфейса — через настройки системы и панель доступности (см. syncSystemFontScale, --a11y-font-scale).
 */
export function applyNativeShellViewportLock(): boolean {
  if (typeof document === 'undefined') return false;

  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    meta.setAttribute('content', LOCKED_VIEWPORT);
  }
  document.documentElement.classList.add('app-native-shell');
  return true;
}
