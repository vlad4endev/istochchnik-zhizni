import { useLayoutEffect, type RefObject } from 'react';

/**
 * iPhone, окно чата в стиле Telegram iOS 26: композер лежит ПОВЕРХ списка сообщений (absolute внизу),
 * а сообщения уходят под него и под шапку. Высота шапки задана в CSS, а высота композера меняется
 * (многострочный ввод, ответ/вложение), поэтому её измеряем и кладём в `--tg-chat-composer-h` —
 * по ней список получает нижний отступ.
 */
function isIosPhoneLayout(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  return (
    document.documentElement.dataset.appleMobile === '1' &&
    window.matchMedia('(max-width: 768px)').matches
  );
}

export function useIosChatInsets(windowRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    if (!isIosPhoneLayout()) return;
    const win = windowRef.current;
    const composer = win?.querySelector<HTMLElement>(':scope > .tg-chat-window__composer') ?? null;
    if (!win || !composer) return;

    const apply = () => {
      win.style.setProperty('--tg-chat-composer-h', `${Math.round(composer.getBoundingClientRect().height)}px`);
    };
    apply();

    if (typeof ResizeObserver === 'undefined') return () => win.style.removeProperty('--tg-chat-composer-h');
    const ro = new ResizeObserver(apply);
    ro.observe(composer);
    return () => {
      ro.disconnect();
      win.style.removeProperty('--tg-chat-composer-h');
    };
  }, [windowRef]);
}
