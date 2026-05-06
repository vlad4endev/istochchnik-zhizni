import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * @param {number} signal меняется при новых сообщениях / индикаторе набора
 */
export function useScrollToBottom(signal) {
  const scrollRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [showScrollDown, setShowScrollDown] = useState(false);
  const userPinnedRef = useRef(false);

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollDown(dist > 200);
      if (dist > 80) {
        userPinnedRef.current = true;
      } else {
        userPinnedRef.current = false;
      }
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (userPinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [signal]);

  const onFabClick = useCallback(() => {
    userPinnedRef.current = false;
    scrollToBottom('smooth');
  }, [scrollToBottom]);

  return { scrollRef, showScrollDown, scrollToBottom, onFabClick };
}
