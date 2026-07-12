/** Событие скрытия основного хрома приложения (сайдбар, нижний таббар) для режима чтения. */
export const LAYOUT_MAIN_CHROME_EVENT = 'app:layout-main-chrome';

export function dispatchLayoutMainChrome(visible: boolean) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LAYOUT_MAIN_CHROME_EVENT, { detail: { visible } }));
}

let mobileBottomNavLockCount = 0;

function isMobileBottomNavViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 1023px)').matches;
}

/** Скрывает нижний таб-бар на lg:hidden; refcount для вложенных модалок. */
export function acquireMobileBottomNavLock(): void {
  if (!isMobileBottomNavViewport()) return;
  mobileBottomNavLockCount += 1;
  if (mobileBottomNavLockCount === 1) {
    dispatchLayoutMainChrome(false);
  }
}

export function releaseMobileBottomNavLock(): void {
  mobileBottomNavLockCount = Math.max(0, mobileBottomNavLockCount - 1);
  if (mobileBottomNavLockCount === 0) {
    dispatchLayoutMainChrome(true);
  }
}
