import { pinBottomNavToLayoutInset, syncBottomNavMeasuredHeight } from './bottomNavInset';
import { isAppleMobileWeb, isInstalledPwa } from '../features/pwa/utils/pwaEnvironment';
import {
  chooseViewportHeightPx,
  computeKeyboardInset,
  computeKeyboardOpen,
  IOS_IDLE_VIEWPORT_CSS,
  iosNeedsLvhIdleShell,
  isSoftwareKeyboardTarget,
  isTextInputFocused,
  layoutBottomInsetPx,
  shouldUseCssViewportOnIosIdle,
  VIEWPORT_HEIGHT_FLOOR_PX,
} from './viewportHeight';

/**
 * Базовый viewport. `interactive-widget=resizes-content` добавляем только на Android:
 * на iOS Safari этот ключ даёт белый экран / сжатую оболочку (таббар посреди экрана).
 */
export const VIEWPORT_BASE =
  'width=device-width, initial-scale=1, minimum-scale=1, viewport-fit=cover';
export const VIEWPORT_ANDROID = `${VIEWPORT_BASE}, interactive-widget=resizes-content`;

export function lockedViewportContent(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  return /Android/i.test(userAgent) ? VIEWPORT_ANDROID : VIEWPORT_BASE;
}

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
  const keyboardInset = computeKeyboardInset(layoutHeight, visualHeight, offsetTop);
  const iosWebKit = isAppleMobileWeb();
  const iosBrowserChrome = iosWebKit && !isInstalledPwa();
  const keyboardOpen = computeKeyboardOpen({
    keyboardInset,
    textInputFocused: isTextInputFocused(document),
    iosWebKit,
  });

  const fromVisual = Math.round(visualHeight);
  const fromDvhProbe = getDvhPx();
  const fromLayout = Math.round(layoutHeight);
  const clientDocH =
    typeof document !== 'undefined' ? Math.round(document.documentElement.clientHeight || 0) : 0;

  const narrowMobileChat =
    typeof window.matchMedia !== 'undefined' &&
    window.matchMedia('(max-width: 768px)').matches &&
    root.dataset.chatOpen === '1';

  let chosen = chooseViewportHeightPx({
    visualHeight: fromVisual,
    layoutHeight: fromLayout,
    dvhPx: fromDvhProbe,
    clientDocH,
    keyboardOpen,
    iosBrowserChrome,
  });
  if (chosen <= 0 && typeof window.screen?.height === 'number' && window.screen.height > 0) {
    chosen = Math.round(window.screen.height);
  }
  const viewportHeightPx = Math.max(VIEWPORT_HEIGHT_FLOOR_PX, chosen > 0 ? chosen : 568);
  const vhPx = `${viewportHeightPx}px`;
  const iosLvhShell = iosWebKit && iosNeedsLvhIdleShell(navigator.userAgent || '');
  const iosIdleCss = shouldUseCssViewportOnIosIdle({ iosWebKit, keyboardOpen, iosLvhShell });
  const layoutInset = layoutBottomInsetPx({ keyboardInset, keyboardOpen, iosWebKit, iosLvhShell });
  root.classList.toggle('app-ios-lvh-shell', iosLvhShell);

  /**
   * iOS 17.5+ без клавиатуры: пиксельная --viewport-height становится containing block для
   * position:fixed. Если visualViewport/100dvh короче настоящего webview, таббар
   * садится посреди экрана, под ним серый холст Safari. 100lvh — большой вьюпорт.
   */
  if (iosIdleCss) {
    root.style.setProperty('--viewport-height', IOS_IDLE_VIEWPORT_CSS);
    root.style.setProperty('--vh', IOS_IDLE_VIEWPORT_CSS);
  } else {
    root.style.setProperty('--viewport-height', vhPx);
    root.style.setProperty('--vh', vhPx);
  }

  /**
   * Мобильный чат: одной CSS var мало — WebKit оставляет цепочку html/body/#root выше видимой области.
   * Фиксируем ту же высоту inline (как px), при выходе из чата или на широком экране снимаем.
   * На iOS idle px-клетку не ставим: тот же half-height баг, что у оболочки.
   */
  if (narrowMobileChat && viewportHeightPx > 0 && !iosIdleCss) {
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
  root.style.setProperty('--visual-viewport-height', vhPx);
  root.style.setProperty('--visual-viewport-offset', `${Math.round(offsetTop)}px`);
  root.style.setProperty('--app-keyboard-inset', `${layoutInset}px`);
  root.classList.toggle('app-keyboard-open', keyboardOpen);
  pinBottomNavToLayoutInset(layoutInset);

  /**
   * Не задаём `html`/`body` через inline `height`/`max-height`: они перебивают `100dvh` в CSS
   * и дают «белую дыру» на iOS при открытии клавиатуры (inline обновляется позже visualViewport).
   * Высота layout — из `height: var(--viewport-height, 100dvh)` в глобальных стилях.
   */

  /** iOS safe-area: env() в отдельном элементе → числовое значение для --app-safe-bottom (fix полоски/отступов в PWA). */
  root.style.setProperty('--app-safe-bottom', getSafeAreaBottomPx());
  /** Реальная высота таб-бара (safe-area + подписи) — env() внутри CSS var на iOS часто даёт 0. */
  syncBottomNavMeasuredHeight(root);
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
  window.addEventListener('pageshow', () => {
    invalidateViewportProbeCaches();
    scheduleSyncViewportHeightVars();
  });
  /** Часть WebView/Android отдаёт visual viewport с задержкой; фокус на поле — типичный триггер клавиатуры. */
  document.addEventListener(
    'focusin',
    (e) => {
      if (!isSoftwareKeyboardTarget(e.target)) return;
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
 * Применяет viewport-meta (масштаб не блокируется) и синхронизирует visual viewport / safe-area.
 * `interactive-widget` — только Android.
 */
export function applyNativeShellViewportLock(): boolean {
  if (typeof document === 'undefined') return false;

  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    meta.setAttribute('content', lockedViewportContent());
  }
  document.documentElement.classList.add('app-native-shell');
  attachViewportWatchers();
  return true;
}
