/** Совпадает с web-react/index.html: без запрета масштаба; resizes-content — клавиатура уменьшает layout viewport (без «дыры» между формой и клавиатурой на iOS). */
const LOCKED_VIEWPORT =
  'width=device-width, initial-scale=1, minimum-scale=1, viewport-fit=cover, interactive-widget=resizes-content';

let viewportWatchAttached = false;
let viewportMetaObserverAttached = false;
let syncAfterPaintRaf = 0;

/** После изменения layout/visual viewport WebKit иногда отдаёт координаты кадром позже — повторяем sync на следующем paint. */
function scheduleSyncViewportHeightVars() {
  syncViewportHeightVars();
  if (typeof window === 'undefined') return;
  if (syncAfterPaintRaf) cancelAnimationFrame(syncAfterPaintRaf);
  syncAfterPaintRaf = window.requestAnimationFrame(() => {
    syncAfterPaintRaf = 0;
    syncViewportHeightVars();
  });
}

function attachViewportMetaObserver() {
  if (viewportMetaObserverAttached || typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return;
  }
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  viewportMetaObserverAttached = true;
  const obs = new MutationObserver(() => {
    const cur = meta.getAttribute('content') ?? '';
    if (cur !== LOCKED_VIEWPORT) {
      meta.setAttribute('content', LOCKED_VIEWPORT);
      scheduleSyncViewportHeightVars();
    }
  });
  obs.observe(meta, { attributes: true, attributeFilter: ['content'] });
}

export function syncViewportHeightVars() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const root = document.documentElement;
  const vv = window.visualViewport;

  const layoutHeight = window.innerHeight || 0;
  const visualHeight = vv?.height ?? layoutHeight;
  const offsetTop = vv?.offsetTop ?? 0;
  /** Нижний «второй» слой (клавиатура / системные полосы): layout минус видимый прямоугольник. */
  const keyboardInset = Math.max(0, Math.round(layoutHeight - offsetTop - visualHeight));
  /** Чуть ниже порога — часть клавиатур / overlay даёт inset 80–100px. */
  const keyboardOpen = keyboardInset >= 72;

  /**
   * Видимая высота: `visualViewport.height` при overlay-клавиатуре; при `interactive-widget=resizes-content`
   * layout и visual часто совпадают — берём min(inner, visual), чтобы не «раздувать» оболочку, если один источник ещё старый.
   */
  const viewportHeightPx = Math.max(0, Math.round(Math.min(layoutHeight, visualHeight)));
  root.style.setProperty('--viewport-height', `${viewportHeightPx}px`);
  /** Старый паттерн `calc(var(--vh, 1vh) * 100)` / совместимость с гайдами — то же значение в px, что и `--viewport-height`. */
  root.style.setProperty('--vh', `${viewportHeightPx}px`);
  root.style.setProperty('--visual-viewport-height', `${viewportHeightPx}px`);
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

  attachViewportMetaObserver();

  const vv = window.visualViewport;
  vv?.addEventListener('resize', scheduleSyncViewportHeightVars);
  vv?.addEventListener('scroll', scheduleSyncViewportHeightVars);
  window.addEventListener('resize', scheduleSyncViewportHeightVars);
  window.addEventListener('orientationchange', scheduleSyncViewportHeightVars);
  /** Часть WebView/Android отдаёт visual viewport с задержкой; фокус на поле — типичный триггер клавиатуры. */
  document.addEventListener(
    'focusin',
    () => {
      queueMicrotask(scheduleSyncViewportHeightVars);
    },
    true,
  );
  document.addEventListener(
    'focusout',
    () => {
      queueMicrotask(scheduleSyncViewportHeightVars);
    },
    true,
  );
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSyncViewportHeightVars();
  });
  scheduleSyncViewportHeightVars();
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
  attachViewportMetaObserver();
  document.documentElement.classList.add('app-native-shell');
  attachViewportWatchers();
  return true;
}
