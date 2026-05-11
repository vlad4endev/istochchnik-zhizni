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
    window.setTimeout(syncPwaStandaloneHtmlDataset, 0);
  });
}
