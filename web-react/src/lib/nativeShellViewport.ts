const LOCKED_VIEWPORT =
  'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no, interactive-widget=resizes-content';

let viewportWatchAttached = false;

function syncViewportState() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const root = document.documentElement;
  const vv = window.visualViewport;

  const layoutHeight = window.innerHeight || 0;
  const visualHeight = vv?.height ?? layoutHeight;
  const offsetTop = vv?.offsetTop ?? 0;
  /** Высота оболочки = layout viewport (`innerHeight`), как у `position:fixed;bottom:0` — иначе на iOS под панелью остаётся полоска фона. */
  const viewportHeight = Math.max(0, Math.round(layoutHeight));
  const keyboardInset = Math.max(0, Math.round(layoutHeight - (visualHeight + offsetTop)));
  const keyboardOpen = keyboardInset >= 110;

  root.style.setProperty('--app-viewport-height', `${viewportHeight}px`);
  root.style.setProperty('--app-keyboard-inset', `${keyboardInset}px`);
  root.classList.toggle('app-keyboard-open', keyboardOpen);
}

function attachViewportWatchers() {
  if (viewportWatchAttached || typeof window === 'undefined' || typeof document === 'undefined') return;
  viewportWatchAttached = true;

  const vv = window.visualViewport;
  vv?.addEventListener('resize', syncViewportState);
  vv?.addEventListener('scroll', syncViewportState);
  window.addEventListener('resize', syncViewportState);
  window.addEventListener('orientationchange', syncViewportState);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncViewportState();
  });
  syncViewportState();
}

/**
 * Фиксирует viewport: без pinch / double-tap zoom в мобильном браузере и в PWA.
 * Масштаб текста в приложении — через панель доступности (--a11y-font-scale), без умножения на «системный» коэффициент.
 * Дополнительно синхронизирует visual viewport (iOS/Android) для стабильной fixed-вёрстки.
 */
export function applyNativeShellViewportLock(): boolean {
  if (typeof document === 'undefined') return false;

  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    meta.setAttribute('content', LOCKED_VIEWPORT);
  }
  document.documentElement.classList.add('app-native-shell');
  attachViewportWatchers();
  return true;
}
