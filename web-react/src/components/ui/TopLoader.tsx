import { useIsFetching } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

export function TopLoader() {
  const isFetching = useIsFetching();
  const isActive = isFetching > 0;
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }

    if (isActive) {
      setVisible(true);
      setWidth(0);
      requestAnimationFrame(() => {
        setWidth(80);
      });
      return;
    }

    setWidth(100);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 280);

    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };
  }, [isActive]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        height: 3,
        width: `${width}%`,
        background: '#D64035',
        zIndex: 9999,
        transition:
          width === 100
            ? 'width 0.15s ease, opacity 0.28s ease'
            : 'width 1.4s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: width === 100 ? 0 : 1,
        borderRadius: '0 2px 2px 0',
        boxShadow: '0 0 8px rgba(214, 64, 53, 0.45)',
      }}
    />
  );
}
