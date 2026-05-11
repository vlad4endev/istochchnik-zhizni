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
/** После focus на поле ввода WebKit обновляет vv с задержкой — несколько коротких повторов sync. */
let keyboardFocusKickTimers: number[] = [];

function scheduleViewportSyncAfterInputFocus() {
  for (const t of keyboardFocusKickTimers) clearTimeout(t);
  keyboardFocusKickTimers = [];
  const delays = [48, 120, 280, 450];
  for (const ms of delays) {
    keyboardFocusKickTimers.push(
      window.setTimeout(() => {
        scheduleSyncViewportHeightVars();
      }, ms),
    );
  }
}

/** Снимаем inline-высоту с цепочки html→body→#root (режим мобильного чата). */
function clearMobileMessengerViewportInline(root: HTMLElement) {
  const props = ['height', 'max-height'] as const;
  for (const p of props) {
    root.style.removeProperty(p);
    if (document.body) document.body.style.removeProperty(p);
    document.getElementById('root')?.style.removeProperty(p);
  }
}
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
  let keyboardInset = Math.max(0, Math.round(layoutHeight - offsetTop - visualHeight));
  /**
   * iOS PWA: на кадр-два `visualViewport.height` ещё «полный», а `window.innerHeight` уже сжат под клавиатуру.
   * Тогда формула выше даёт inset≈0 и --viewport-height остаётся огромным → пол экрана пустоты.
   * Добираем inset из разницы «устаревший vv vs актуальный layout».
   */
  if (vv && layoutHeight > 0 && visualHeight > layoutHeight + 2) {
    keyboardInset = Math.max(keyboardInset, Math.round(visualHeight - layoutHeight));
  }
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
  const clientDocH =
    typeof document !== 'undefined' ? Math.round(document.documentElement.clientHeight || 0) : 0;

  const narrowMobileChat =
    typeof window.matchMedia !== 'undefined' &&
    window.matchMedia('(max-width: 768px)').matches &&
    root.dataset.chatOpen === '1';

  /**
   * Высота оболочки = видимая полоса над клавиатурой.
   * Узкий экран + открытый чат: берём минимум из visual / inner / clientHeight — на мобиле хотя бы одна метрика
   * уже отражает клавиатуру, иначе остаётся «пол экрана» пустоты.
   * iOS: если vv отстаёт выше innerHeight — дополнительно clamp от innerHeight.
   */
  let chosen: number;
  if (narrowMobileChat) {
    const pool = [fromVisual, fromLayout, clientDocH].filter((x) => x > 0);
    chosen = pool.length > 0 ? Math.min(...pool) : 0;
    if (fromLayout > 0 && fromVisual > fromLayout + 4) {
      chosen = Math.min(chosen > 0 ? chosen : fromLayout, fromLayout);
    }
  } else if (fromLayout > 0 && fromVisual > fromLayout + 4) {
    chosen = fromLayout;
  } else if (fromVisual > 0 && fromLayout > 0) {
    chosen = Math.min(fromVisual, fromLayout);
  } else if (fromVisual > 0) {
    chosen = fromVisual;
  } else if (fromDvhProbe > 0) {
    chosen = fromDvhProbe;
  } else if (fromLayout > 0) {
    chosen = fromLayout;
  } else {
    chosen = 0;
  }
  if (chosen <= 0 && typeof window.screen?.height === 'number' && window.screen.height > 0) {
    chosen = Math.round(window.screen.height);
  }
  const viewportHeightPx = Math.max(120, chosen > 0 ? chosen : 568);
  const vhPx = `${viewportHeightPx}px`;

  root.style.setProperty('--viewport-height', vhPx);

  /**
   * Мобильный чат: одной CSS var мало — WebKit оставляет цепочку html/body/#root выше видимой области.
   * Фиксируем ту же высоту inline (как px), при выходе из чата или на широком экране снимаем.
   */
  if (narrowMobileChat && viewportHeightPx > 0) {
    root.style.setProperty('height', vhPx, 'important');
    root.style.setProperty('max-height', vhPx, 'important');
    document.body?.style.setProperty('height', vhPx, 'important');
    document.body?.style.setProperty('max-height', vhPx, 'important');
    document.getElementById('root')?.style.setProperty('height', vhPx, 'important');
    document.getElementById('root')?.style.setProperty('max-height', vhPx, 'important');
    /**
     * iOS PWA: при focus в textarea/поле WebKit «прокручивает» документ, чтобы поднять поле над клавиатурой.
     * overflow:hidden это не останавливает. Снимаем любой layout-scroll → чат остаётся в видимой области,
     * пустая полоса под клавиатурой не появляется.
     */
    if (root.scrollTop !== 0) root.scrollTop = 0;
    if (document.body && document.body.scrollTop !== 0) document.body.scrollTop = 0;
    if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
  } else {
    clearMobileMessengerViewportInline(root);
  }
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
      scheduleViewportSyncAfterInputFocus();
    },
    true,
  );
  document.addEventListener(
    'focusout',
    () => {
      for (const t of keyboardFocusKickTimers) clearTimeout(t);
      keyboardFocusKickTimers = [];
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
