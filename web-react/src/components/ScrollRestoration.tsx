import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const scrollPositions: Record<string, number> = {};

function routeKey(pathname: string, search: string) {
  return `${pathname}${search}`;
}

function getAppScrollEl(): HTMLElement | null {
  return document.querySelector('main.app-main-content');
}

export function ScrollRestoration() {
  const { pathname, search } = useLocation();
  const prevKeyRef = useRef(routeKey(pathname, search));

  useEffect(() => {
    const saveScroll = () => {
      const el = getAppScrollEl();
      const y = el ? el.scrollTop : window.scrollY;
      scrollPositions[prevKeyRef.current] = y;
    };
    const el = getAppScrollEl();
    const target: HTMLElement | Window = el ?? window;
    target.addEventListener('scroll', saveScroll, { passive: true });
    return () => target.removeEventListener('scroll', saveScroll);
  }, []);

  useEffect(() => {
    const currentKey = routeKey(pathname, search);
    const saved = scrollPositions[currentKey] ?? 0;
    const el = getAppScrollEl();
    if (el) {
      el.scrollTo({ top: saved, behavior: 'auto' });
    } else {
      window.scrollTo({ top: saved, behavior: 'auto' });
    }
    prevKeyRef.current = currentKey;
  }, [pathname, search]);

  return null;
}
