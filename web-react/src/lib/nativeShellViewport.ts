/** Совпадает с web-react/index.html: без запрета масштаба; resizes-visual — клавиатура уменьшает visual viewport, layout не перетекаает. */
const LOCKED_VIEWPORT =
  'width=device-width, initial-scale=1, minimum-scale=1, viewport-fit=cover, interactive-widget=resizes-visual';

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

  /** iOS safe-area: env() в отдельном элементе → числовое значение для --app-safe-bottom (fix полоски/отступов в PWA). */
  try {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:-9999px;top:0;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px)';
    document.documentElement.appendChild(probe);
    const pb = getComputedStyle(probe).paddingBottom || '0px';
    document.documentElement.removeChild(probe);
    root.style.setProperty('--app-safe-bottom', pb);
  } catch {
    /* ignore */
  }
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
 * Применяет viewport-meta как в index.html (масштаб не блокируется) и синхронизирует visual viewport / safe-area.
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
