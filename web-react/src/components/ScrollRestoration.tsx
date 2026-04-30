import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const scrollPositions: Record<string, number> = {};

function routeKey(pathname: string, search: string) {
  return `${pathname}${search}`;
}

export function ScrollRestoration() {
  const { pathname, search } = useLocation();
  const prevKeyRef = useRef(routeKey(pathname, search));

  useEffect(() => {
    const saveScroll = () => {
      scrollPositions[prevKeyRef.current] = window.scrollY;
    };
    window.addEventListener('scroll', saveScroll, { passive: true });
    return () => window.removeEventListener('scroll', saveScroll);
  }, []);

  useEffect(() => {
    const currentKey = routeKey(pathname, search);
    const saved = scrollPositions[currentKey] ?? 0;
    window.scrollTo({ top: saved, behavior: 'auto' });
    prevKeyRef.current = currentKey;
  }, [pathname, search]);

  return null;
}
