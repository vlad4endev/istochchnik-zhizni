import { useLayoutEffect, useState, type RefObject } from 'react';

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

/**
 * Возвращает, на сколько px композер перекрывает низ списка сообщений (0 вне iPhone-раскладки).
 * Считаем геометрией (низ окна чата − верх композера), а не только высотой композера: так учитываются
 * тени, safe-area и любые сдвиги. Значение кладётся и в `--tg-chat-composer-h`, и возвращается — список
 * получает реальный DOM-отступ и `scrollPaddingEnd` виртуализатора, не завися от CSS-переменных.
 */
export function useIosChatInsets(windowRef: RefObject<HTMLElement | null>): number {
  const [overlay, setOverlay] = useState(0);
  useLayoutEffect(() => {
    if (!isIosPhoneLayout()) return;
    const win = windowRef.current;
    const composer = win?.querySelector<HTMLElement>(':scope > .tg-chat-window__composer') ?? null;
    if (!win || !composer) return;

    const apply = () => {
      const h = Math.round(composer.getBoundingClientRect().height);
      const geo = Math.round(win.getBoundingClientRect().bottom - composer.getBoundingClientRect().top);
      const next = Math.max(h, geo > 0 && geo < 600 ? geo : 0);
      win.style.setProperty('--tg-chat-composer-h', `${next}px`);
      setOverlay((prev) => (prev === next ? prev : next));
    };
    apply();

    const cleanup = () => {
      win.style.removeProperty('--tg-chat-composer-h');
      setOverlay(0);
    };
    if (typeof ResizeObserver === 'undefined') return cleanup;
    const ro = new ResizeObserver(apply);
    ro.observe(composer);
    ro.observe(win);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', apply);
    return () => {
      ro.disconnect();
      vv?.removeEventListener('resize', apply);
      cleanup();
    };
  }, [windowRef]);
  return overlay;
}
