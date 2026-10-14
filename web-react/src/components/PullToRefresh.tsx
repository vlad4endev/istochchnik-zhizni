import { useCallback, useRef, useState, type ReactNode } from 'react';

import { hapticLight } from '../lib/nativeShell';
import { isNativePlatform } from '../lib/platform';

type Props = {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
};

/**
 * Lightweight pull-to-refresh for native / touch lists (no hover dependency).
 */
export function PullToRefresh({ onRefresh, children, className, disabled }: Props) {
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const enabled = !disabled && (isNativePlatform() || (typeof window !== 'undefined' && 'ontouchstart' in window));

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || refreshing) return;
      const el = e.currentTarget as HTMLElement;
      if (el.scrollTop > 0) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0]?.clientY ?? null;
    },
    [enabled, refreshing],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || refreshing || startY.current == null) return;
      const y = e.touches[0]?.clientY ?? startY.current;
      const delta = Math.max(0, Math.min(96, y - startY.current));
      setPull(delta);
    },
    [enabled, refreshing],
  );

  const onTouchEnd = useCallback(async () => {
    if (!enabled || refreshing) return;
    const should = pull > 64;
    startY.current = null;
    setPull(0);
    if (!should) return;
    setRefreshing(true);
    void hapticLight();
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [enabled, onRefresh, pull, refreshing]);

  return (
    <div
      className={className}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={() => void onTouchEnd()}
      style={{ overscrollBehaviorY: 'contain' }}
    >
      {(pull > 0 || refreshing) && (
        <div
          className="pointer-events-none flex items-center justify-center text-xs text-[var(--text-muted)]"
          style={{ height: refreshing ? 36 : pull * 0.5 }}
          aria-live="polite"
        >
          {refreshing ? 'Обновление…' : pull > 64 ? 'Отпустите' : 'Потяните'}
        </div>
      )}
      {children}
    </div>
  );
}
