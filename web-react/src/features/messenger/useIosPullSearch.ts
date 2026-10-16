import { useLayoutEffect, type RefObject } from 'react';

/**
 * iPhone: строка поиска в списке чатов спрятана над списком и появляется, если потянуть вниз
 * в самом начале (как в Telegram). Скролл-контейнер — `.tg-sidebar`; при монтировании он уже
 * прокручен на высоту поиска, поэтому поиск «над» списком, а тянуть можно естественным
 * скроллом с инерцией. Прогресс (0 — спрятан, 1 — открыт) пишется в `--tg-search-reveal`,
 * по нему CSS рисует проявление/масштаб; по окончании жеста доводим до ближайшего состояния.
 */
const SNAP_IDLE_MS = 110;

function isIosPhoneLayout(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  return (
    document.documentElement.dataset.appleMobile === '1' &&
    window.matchMedia('(max-width: 768px)').matches
  );
}

export function useIosPullSearch(
  rootRef: RefObject<HTMLElement | null>,
  ready: boolean,
  hasQuery: boolean,
): void {
  useLayoutEffect(() => {
    if (!ready || !isIosPhoneLayout()) return;
    const root = rootRef.current;
    const aside = root?.closest<HTMLElement>('.tg-sidebar') ?? null;
    const search = root?.querySelector<HTMLElement>('.tg-chatlist-search') ?? null;
    if (!root || !aside || !search) return;

    let blockH = 0;
    let raf = 0;
    let idleTimer = 0;
    let touching = false;
    let snapping = false;

    const measure = () => {
      const cs = getComputedStyle(search);
      blockH = Math.round(
        search.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0),
      );
      aside.style.setProperty('--tg-search-h', `${blockH}px`);
    };

    const paint = () => {
      raf = 0;
      if (blockH <= 0) return;
      const p = Math.min(1, Math.max(0, 1 - aside.scrollTop / blockH));
      aside.style.setProperty('--tg-search-reveal', p.toFixed(3));
    };

    const schedulePaint = () => {
      if (!raf) raf = window.requestAnimationFrame(paint);
    };

    const searchFocused = () => document.activeElement?.closest('.tg-chatlist-search') != null;

    const snap = () => {
      idleTimer = 0;
      if (touching || blockH <= 0) return;
      const top = aside.scrollTop;
      if (top <= 0 || top >= blockH) return;
      const keepOpen = searchFocused() || (search.querySelector('input')?.value ?? '') !== '';
      const target = keepOpen || top < blockH / 2 ? 0 : blockH;
      snapping = true;
      aside.scrollTo({ top: target, behavior: 'smooth' });
      window.setTimeout(() => {
        snapping = false;
      }, 320);
    };

    const onScroll = () => {
      schedulePaint();
      if (snapping) return;
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(snap, SNAP_IDLE_MS);
    };
    const onTouchStart = () => {
      touching = true;
      snapping = false;
      if (idleTimer) window.clearTimeout(idleTimer);
    };
    const onTouchEnd = () => {
      touching = false;
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(snap, SNAP_IDLE_MS);
    };
    const onResize = () => {
      measure();
      schedulePaint();
    };

    measure();
    /** Спрятать поиск до первого кадра — без вспышки. Если уже есть запрос, оставляем открытым. */
    if (!hasQuery && blockH > 0) {
      void aside.offsetHeight;
      aside.scrollTop = blockH;
    }
    paint();

    aside.addEventListener('scroll', onScroll, { passive: true });
    aside.addEventListener('touchstart', onTouchStart, { passive: true });
    aside.addEventListener('touchend', onTouchEnd, { passive: true });
    aside.addEventListener('touchcancel', onTouchEnd, { passive: true });
    window.addEventListener('resize', onResize);

    return () => {
      aside.removeEventListener('scroll', onScroll);
      aside.removeEventListener('touchstart', onTouchStart);
      aside.removeEventListener('touchend', onTouchEnd);
      aside.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('resize', onResize);
      if (raf) window.cancelAnimationFrame(raf);
      if (idleTimer) window.clearTimeout(idleTimer);
      aside.style.removeProperty('--tg-search-h');
      aside.style.removeProperty('--tg-search-reveal');
    };
    // hasQuery читаем только при монтировании: смена запроса не должна заново прятать поиск.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, rootRef]);
}
