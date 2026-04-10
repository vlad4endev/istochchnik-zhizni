/** Событие скрытия основного хрома приложения (сайдбар, нижний таббар) для режима чтения. */
export const LAYOUT_MAIN_CHROME_EVENT = 'app:layout-main-chrome';

export function dispatchLayoutMainChrome(visible: boolean) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LAYOUT_MAIN_CHROME_EVENT, { detail: { visible } }));
}
