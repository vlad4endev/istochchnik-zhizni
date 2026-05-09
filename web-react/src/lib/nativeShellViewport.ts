/** Совпадает с web-react/index.html: без запрета масштаба; resizes-content — клавиатура уменьшает layout viewport (без «дыры» между формой и клавиатурой на iOS). */
const LOCKED_VIEWPORT =
  'width=device-width, initial-scale=1, minimum-scale=1, viewport-fit=cover, interactive-widget=resizes-content';

let viewportWatchAttached = false;

function syncViewportState() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const root = document.documentElement;
  const vv = window.visualViewport;

  const layoutHeight = window.innerHeight || 0;
  const visualHeight = vv?.height ?? layoutHeight;
  const offsetTop = vv?.offsetTop ?? 0;
  /** Нижний «второй» слой (клавиатура / системные полосы): layout минус видимый прямоугольник. */
  const keyboardInset = Math.max(0, Math.round(layoutHeight - offsetTop - visualHeight));
  const keyboardOpen = keyboardInset >= 110;
  /**
   * Обычно — layout (`innerHeight`). При открытой клавиатуре и старом/битом `interactive-widget=resizes-visual`
   * layout остаётся полноэкранным, а visual viewport сжат — берём min, чтобы оболочка не была выше видимой области.
   */
  const visibleBottom = Math.round(offsetTop + visualHeight);
  const viewportHeight = keyboardOpen
    ? Math.max(0, Math.min(layoutHeight, visibleBottom))
    : Math.max(0, Math.round(layoutHeight));

  root.style.setProperty('--app-viewport-height', `${viewportHeight}px`);
  root.style.setProperty('--visual-viewport-height', `${Math.max(0, Math.round(visualHeight))}px`);
  root.style.setProperty('--visual-viewport-offset', `${Math.round(offsetTop)}px`);
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
  /** Часть WebView/Android отдаёт visual viewport с задержкой; фокус на поле — типичный триггер клавиатуры. */
  document.addEventListener(
    'focusin',
    () => {
      queueMicrotask(syncViewportState);
    },
    true,
  );
  document.addEventListener(
    'focusout',
    () => {
      queueMicrotask(syncViewportState);
    },
    true,
  );
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
