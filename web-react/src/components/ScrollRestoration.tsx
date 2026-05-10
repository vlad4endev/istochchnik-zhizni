import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { getAppScrollRoot } from '@/lib/appScroll';

const scrollPositions: Record<string, number> = {};

function routeKey(pathname: string, search: string) {
  return `${pathname}${search}`;
}

export function ScrollRestoration() {
  const { pathname, search } = useLocation();
  const prevKeyRef = useRef(routeKey(pathname, search));

  useEffect(() => {
    const saveScroll = () => {
      const el = getAppScrollRoot();
      const y = el ? el.scrollTop : window.scrollY;
      scrollPositions[prevKeyRef.current] = y;
    };
    const el = getAppScrollRoot();
    const target: HTMLElement | Window = el ?? window;
    target.addEventListener('scroll', saveScroll, { passive: true });
    return () => target.removeEventListener('scroll', saveScroll);
  }, []);

  useEffect(() => {
    const currentKey = routeKey(pathname, search);
    const saved = scrollPositions[currentKey] ?? 0;
    const el = getAppScrollRoot();
    if (el) {
      el.scrollTo({ top: saved, behavior: 'auto' });
    } else {
      window.scrollTo({ top: saved, behavior: 'auto' });
    }
    prevKeyRef.current = currentKey;
  }, [pathname, search]);

  return null;
}
