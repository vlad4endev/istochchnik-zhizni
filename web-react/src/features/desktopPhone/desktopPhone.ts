/**
 * Вид «телефон» на компьютере: приложение открывается в рамке телефона (iframe того же адреса),
 * внутри которой срабатывают мобильные media-запросы — нижнее меню вместо боковой панели.
 * Отключается кнопкой «Полная версия» (запоминается) или адресом с `?full=1`.
 */
export const DESKTOP_PHONE_STORAGE_KEY = 'app:desktop-phone';
export const DESKTOP_PHONE_PATH_MESSAGE = 'app:path';
export const DESKTOP_PHONE_MIN_WIDTH = 1024;
/** Выставляется, если приложение не ответило из рамки (например, сервер запретил встраивание). */
export const DESKTOP_PHONE_FALLBACK_KEY = 'app:desktop-phone-fallback';

export function isInsideFrame(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function isNativeApp(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function isDesktopPhonePreferred(): boolean {
  try {
    return localStorage.getItem(DESKTOP_PHONE_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setDesktopPhonePreferred(on: boolean): void {
  try {
    localStorage.setItem(DESKTOP_PHONE_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

/** Компьютер: широкое окно, точная мышь, не нативное приложение и не вложенный кадр. */
export function isDesktopViewport(): boolean {
  if (typeof window === 'undefined' || isInsideFrame() || isNativeApp()) return false;
  return (
    window.innerWidth >= DESKTOP_PHONE_MIN_WIDTH && window.matchMedia('(pointer: fine)').matches
  );
}

export function shouldUseDesktopPhoneShell(): boolean {
  if (!isDesktopViewport()) return false;
  try {
    if (sessionStorage.getItem(DESKTOP_PHONE_FALLBACK_KEY) === '1') return false;
  } catch {
    /* ignore */
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get('full') === '1') {
    setDesktopPhonePreferred(false);
    return false;
  }
  if (params.get('phone') === '1') setDesktopPhonePreferred(true);
  return isDesktopPhonePreferred();
}

/** Внутри любой рамки: помечает html, чтобы CSS мог заменить недостающий safe-area. */
export function markPhoneFrame(): void {
  if (typeof document !== 'undefined' && isInsideFrame()) {
    document.documentElement.setAttribute('data-phone-frame', '1');
  }
}
