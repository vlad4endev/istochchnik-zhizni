/**
 * Совпадает с web-react/index.html.
 * `interactive-widget=resizes-content` (Chrome 108+, Android WebView): при клавиатуре layout viewport
 * сжимается — лучше стык с `visualViewport` / полями ввода. Старые движки не знают ключа — игнорируют.
 * Риск на редких iOS: если увидите «белый экран» при старте PWA — откатить только эту опцию.
 */
const LOCKED_VIEWPORT =
  'width=device-width, initial-scale=1, minimum-scale=1, viewport-fit=cover, interactive-widget=resizes-content';

let viewportWatchAttached = false;
let syncAfterPaintRaf = 0;
let dvhProbe: HTMLDivElement | null = null;
let safeAreaProbe: HTMLDivElement | null = null;
let viewportProbeVersion = 0;
let cachedDvhPx: number | null = null;
let cachedDvhVersion = -1;
let cachedSafeBottom = '0px';
let cachedSafeBottomVersion = -1;

function invalidateViewportProbeCaches() {
  viewportProbeVersion += 1;
}

function getDvhPx(): number {
  if (typeof document === 'undefined') return 0;
  if (!dvhProbe) {
    dvhProbe = document.createElement('div');
    dvhProbe.style.cssText =
      'position:fixed;left:-9999px;top:0;height:100dvh;pointer-events:none;visibility:hidden;';
    document.documentElement.appendChild(dvhProbe);
  }
  if (cachedDvhPx == null || cachedDvhVersion !== viewportProbeVersion) {
    cachedDvhPx = Math.round(dvhProbe.offsetHeight || 0);
    cachedDvhVersion = viewportProbeVersion;
  }
  return cachedDvhPx;
}

function getSafeAreaBottomPx(): string {
  if (typeof document === 'undefined') return '0px';
  if (!safeAreaProbe) {
    safeAreaProbe = document.createElement('div');
    safeAreaProbe.style.cssText =
      'position:fixed;left:-9999px;top:0;pointer-events:none;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px)';
    document.documentElement.appendChild(safeAreaProbe);
  }
  if (cachedSafeBottomVersion !== viewportProbeVersion) {
    cachedSafeBottom = getComputedStyle(safeAreaProbe).paddingBottom || '0px';
    cachedSafeBottomVersion = viewportProbeVersion;
  }
  return cachedSafeBottom;
}

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

export function syncViewportHeightVars() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const root = document.documentElement;
  const vv = window.visualViewport;

  const layoutHeight = window.innerHeight || 0;
  const visualHeight = vv?.height ?? layoutHeight;
  const offsetTop = vv?.offsetTop ?? 0;
  /** Нижний «второй» слой (клавиатура / системные полосы): layout минус видимый прямоугольник. */
  const keyboardInset = Math.max(0, Math.round(layoutHeight - offsetTop - visualHeight));
  /**
   * Раньше порог 110px — на части iPhone / компактной клавиатуре inset ~60–90px и класс не включался:
   * таббар оставался «в потоке» отступов, safe-area дублировался, появлялись белые полосы.
   */
  const keyboardOpen = keyboardInset >= 48;

  /**
   * Видимая область: в первую очередь `visualViewport` (iOS PWA + клавиатура).
   * Не используем `min(inner, visual)`: в редких кадрах WebKit отдаёт 0 — PWA схлопывается в ноль.
   * Нижняя граница, чтобы никогда не писать `--viewport-height: 0px` в оболочку.
   */
  const fromVisual = Math.round(visualHeight);
  const fromDvhProbe = getDvhPx();
  const fromLayout = Math.round(layoutHeight);
  /**
   * На iOS кадр с открытой клавиатурой иногда отдаёт visualViewport «полной» высоты, а layout / `100dvh`
   * уже сжаты (`interactive-widget` или probe). Берём минимум в PWA — убираем белую полосу без ожидания следующего resize.
   */
  const preferMinVisualAndDvh =
    root.classList.contains('app-native-shell') && fromVisual > 0 && fromDvhProbe > 0;
  let chosen = preferMinVisualAndDvh
    ? Math.min(fromVisual, fromDvhProbe)
    : fromVisual > 0
      ? fromVisual
      : fromDvhProbe > 0
        ? fromDvhProbe
        : fromLayout > 0
          ? fromLayout
          : 0;
  if (chosen <= 0 && typeof window.screen?.height === 'number' && window.screen.height > 0) {
    chosen = Math.round(window.screen.height);
  }
  const viewportHeightPx = Math.max(120, chosen > 0 ? chosen : 568);
  const vhPx = `${viewportHeightPx}px`;

  root.style.setProperty('--viewport-height', vhPx);
  /** Старый паттерн `calc(var(--vh, 1vh) * 100)` / совместимость с гайдами. */
  root.style.setProperty('--vh', vhPx);
  root.style.setProperty('--visual-viewport-height', vhPx);
  root.style.setProperty('--visual-viewport-offset', `${Math.round(offsetTop)}px`);
  root.style.setProperty('--app-keyboard-inset', `${keyboardInset}px`);
  root.classList.toggle('app-keyboard-open', keyboardOpen);

  /**
   * Не задаём `html`/`body` через inline `height`/`max-height`: они перебивают `100dvh` в CSS
   * и дают «белую дыру» на iOS при открытии клавиатуры (inline обновляется позже visualViewport).
   * Высота layout — из `height: var(--viewport-height, 100dvh)` в глобальных стилях.
   */

  /** iOS safe-area: env() в отдельном элементе → числовое значение для --app-safe-bottom (fix полоски/отступов в PWA). */
  root.style.setProperty('--app-safe-bottom', getSafeAreaBottomPx());
}

function attachViewportWatchers() {
  if (viewportWatchAttached || typeof window === 'undefined' || typeof document === 'undefined') return;
  viewportWatchAttached = true;

  const vv = window.visualViewport;
  vv?.addEventListener('resize', () => {
    invalidateViewportProbeCaches();
    scheduleSyncViewportHeightVars();
  });
  vv?.addEventListener('scroll', scheduleSyncViewportHeightVars);
  window.addEventListener('resize', () => {
    invalidateViewportProbeCaches();
    scheduleSyncViewportHeightVars();
  });
  window.addEventListener('orientationchange', () => {
    invalidateViewportProbeCaches();
    scheduleSyncViewportHeightVars();
  });
  /** Часть WebView/Android отдаёт visual viewport с задержкой; фокус на поле — типичный триггер клавиатуры. */
  document.addEventListener(
    'focusin',
    (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const tag = target.tagName;
      const triggersKeyboard =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable ||
        target.getAttribute('contenteditable') === 'true';
      if (!triggersKeyboard) return;
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
  document.documentElement.classList.add('app-native-shell');
  attachViewportWatchers();
  return true;
}
