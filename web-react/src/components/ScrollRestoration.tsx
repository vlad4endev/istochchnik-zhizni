import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { getAppScrollRoot } from '@/lib/appScroll';
import { readRouteScroll, saveLastAppRoute, saveRouteScroll } from '@/lib/persistAppLocation';

/** In-memory cache for instant route switches within the same session. */
const scrollPositions: Record<string, number> = {};

function routeKey(pathname: string, search: string) {
  return `${pathname}${search}`;
}

function readScrollY(): number {
  const el = getAppScrollRoot();
  return el ? el.scrollTop : window.scrollY;
}

function writeScrollY(y: number): void {
  const el = getAppScrollRoot();
  if (el) {
    el.scrollTo({ top: y, behavior: 'auto' });
  } else {
    window.scrollTo({ top: y, behavior: 'auto' });
  }
}

function applySavedScroll(key: string): void {
  const fromMemory = scrollPositions[key];
  const fromStore = readRouteScroll(key);
  const saved = fromMemory ?? fromStore ?? 0;
  writeScrollY(saved);
}

/**
 * Сохраняет/восстанавливает скролл `#main-content` / `#root` при смене маршрута
 * и при возврате во вкладку / из bfcache (visibility / pageshow).
 */
export function ScrollRestoration() {
  const { pathname, search } = useLocation();
  const prevKeyRef = useRef(routeKey(pathname, search));

  useEffect(() => {
    const saveScroll = () => {
      const y = readScrollY();
      const key = prevKeyRef.current;
      scrollPositions[key] = y;
      saveRouteScroll(key, y);
    };
    const el = getAppScrollRoot();
    const target: HTMLElement | Window = el ?? window;
    target.addEventListener('scroll', saveScroll, { passive: true });

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        saveScroll();
        return;
      }
      // Небольшая задержка: nativeShellViewport / layout могут сбросить scrollTop=0.
      requestAnimationFrame(() => {
        applySavedScroll(prevKeyRef.current);
      });
    };
    const onPageHide = () => {
      saveScroll();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        requestAnimationFrame(() => applySavedScroll(prevKeyRef.current));
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      target.removeEventListener('scroll', saveScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  useEffect(() => {
    const currentKey = routeKey(pathname, search);
    const prevKey = prevKeyRef.current;
    if (prevKey !== currentKey) {
      const y = readScrollY();
      scrollPositions[prevKey] = y;
      saveRouteScroll(prevKey, y);
    }

    applySavedScroll(currentKey);
    prevKeyRef.current = currentKey;
    saveLastAppRoute(currentKey);
  }, [pathname, search]);

  return null;
}
