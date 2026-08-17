/** Селектор нижней панели — совпадает с `Layout.tsx`. */
export const BOTTOM_NAV_SELECTOR = 'nav.app-bottom-nav';
export const BOTTOM_NAV_MEASURED_VAR = '--app-bottom-nav-measured-height';

/**
 * Высота видимой нижней панели в CSS-пикселях.
 * `null` — панель скрыта (`display`/`visibility`/`opacity`) или ещё не смонтирована:
 * тогда не затираем предыдущее измерение нулём.
 */
export function measuredBottomNavHeightPx(nav: HTMLElement | null): number | null {
  if (!nav) return null;
  const style = getComputedStyle(nav);
  if (style.display === 'none' || style.visibility === 'hidden') return null;
  const opacity = Number.parseFloat(style.opacity);
  if (Number.isFinite(opacity) && opacity <= 0) return null;
  const height = nav.getBoundingClientRect().height;
  if (!Number.isFinite(height) || height <= 0) return null;
  return Math.round(height);
}

/** Пишет `--app-bottom-nav-measured-height` на `:root`, чтобы отступ контента совпадал с реальной панелью. */
export function syncBottomNavMeasuredHeight(
  root: HTMLElement = document.documentElement,
): number | null {
  const nav = document.querySelector<HTMLElement>(BOTTOM_NAV_SELECTOR);
  const height = measuredBottomNavHeightPx(nav);
  if (height == null) return null;
  root.style.setProperty(BOTTOM_NAV_MEASURED_VAR, `${height}px`);
  return height;
}
