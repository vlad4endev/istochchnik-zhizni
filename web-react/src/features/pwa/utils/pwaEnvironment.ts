/**
 * PWA открыта как установленное приложение (ярлык с главного экрана / «Установить приложение»).
 * На iOS важно учитывать `navigator.standalone` — `display-mode: standalone` иногда не срабатывает сразу.
 */
export function isInstalledPwa(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
  } catch {
    /* ignore */
  }
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

/** iPhone / iPod / iPad в браузере (включая iPadOS с User-Agent как на Mac). */
export function isAppleMobileWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/iPad|iPhone|iPod/i.test(navigator.userAgent)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/**
 * На iOS с `navigator.standalone` `matchMedia('(display-mode: standalone)')` иногда не срабатывает
 * до следующего кадра — помечаем `<html data-pwa-standalone>` для CSS (фон, safe hints).
 */
export function syncPwaStandaloneHtmlDataset(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.pwaStandalone = isInstalledPwa() ? '1' : '0';
}

/** Mark `<html data-apple-mobile="1">` for CSS (e.g. iOS-only messenger composer styling). */
export function syncAppleMobileWebHtmlDataset(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.appleMobile = isAppleMobileWeb() ? '1' : '0';
}

/** Android WebView / PWA on Android — CSS BiDi fixes for messenger text. */
export function isAndroidWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

export function syncAndroidWebHtmlDataset(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.androidMessenger = isAndroidWeb() ? '1' : '0';
  document.documentElement.dataset.androidPwa = isAndroidInstalledPwa() ? '1' : '0';
}

/** Установленная PWA на Android (ярлык с главного экрана / Chrome «Установить»). */
export function isAndroidInstalledPwa(): boolean {
  return isAndroidWeb() && isInstalledPwa();
}

const PWA_SPLASH_THEME_COLOR = '#f4f1ed';
const PWA_APP_THEME_COLOR_LIGHT = '#7d3640';
const PWA_APP_THEME_COLOR_DARK = '#5c2830';

function setThemeColorMeta(content: string): void {
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = content;
  });
}

/** Статус-бар Chrome в тон кремового сплэша (до первого кадра React). */
export function applyPwaSplashThemeColor(): void {
  if (typeof document === 'undefined') return;
  if (!isInstalledPwa()) return;
  setThemeColorMeta(PWA_SPLASH_THEME_COLOR);
}

/** Вернуть theme-color после сплэша — как в index.html / манифесте. */
export function restorePwaAppThemeColor(): void {
  if (typeof document === 'undefined') return;
  const dark =
    document.documentElement.getAttribute('data-mantine-color-scheme') === 'dark' ||
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const media = meta.getAttribute('media') ?? '';
    if (media.includes('prefers-color-scheme: dark')) {
      meta.content = PWA_APP_THEME_COLOR_DARK;
      return;
    }
    if (media.includes('prefers-color-scheme: light')) {
      meta.content = PWA_APP_THEME_COLOR_LIGHT;
      return;
    }
    meta.content = dark ? PWA_APP_THEME_COLOR_DARK : PWA_APP_THEME_COLOR_LIGHT;
  });
}

const DISPLAY_MODE_QUERIES = [
  '(display-mode: standalone)',
  '(display-mode: fullscreen)',
  '(display-mode: minimal-ui)',
] as const;

/** Подписка на смену режима отображения (установка PWA, ориентация). */
export function initPwaStandaloneHtmlHint(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  syncPwaStandaloneHtmlDataset();
  syncAppleMobileWebHtmlDataset();
  syncAndroidWebHtmlDataset();
  applyPwaSplashThemeColor();
  for (const q of DISPLAY_MODE_QUERIES) {
    try {
      const mql = window.matchMedia(q);
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', syncPwaStandaloneHtmlDataset);
      } else {
        mql.addListener(syncPwaStandaloneHtmlDataset);
      }
    } catch {
      /* ignore */
    }
  }
  window.addEventListener('orientationchange', () => {
    window.setTimeout(() => {
      syncPwaStandaloneHtmlDataset();
      syncAndroidWebHtmlDataset();
    }, 0);
  });
}
