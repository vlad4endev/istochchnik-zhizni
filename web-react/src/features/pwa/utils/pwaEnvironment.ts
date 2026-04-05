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
