import { useEffect, useRef } from 'react';

interface SwipeOptions {
  onSwipeRight?: () => void;
  minDistance?: number;
  minVelocity?: number;
}

export function useSwipeGesture(
  elementRef: React.RefObject<HTMLElement>,
  options: SwipeOptions
) {
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const passive: AddEventListenerOptions = { passive: true };

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0]?.clientX ?? 0;
      touchStartY.current = e.touches[0]?.clientY ?? 0;
      touchStartTime.current = Date.now();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touchEndX = e.changedTouches[0]?.clientX ?? 0;
      const touchEndY = e.changedTouches[0]?.clientY ?? 0;
      const touchEndTime = Date.now();

      const deltaX = touchEndX - touchStartX.current;
      const deltaY = touchEndY - touchStartY.current;
      const deltaTime = touchEndTime - touchStartTime.current;

      const minDistance = options.minDistance ?? 50;
      const minVelocity = options.minVelocity ?? 100;

      // Detect swipe right (positive deltaX, mostly horizontal)
      if (
        deltaX > minDistance &&
        Math.abs(deltaY) < Math.abs(deltaX) * 0.3 &&
        deltaX / deltaTime > minVelocity / 1000
      ) {
        options.onSwipeRight?.();
      }
    };

    element.addEventListener('touchstart', handleTouchStart, passive);
    element.addEventListener('touchend', handleTouchEnd, passive);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart, passive);
      element.removeEventListener('touchend', handleTouchEnd, passive);
    };
  }, [elementRef, options]);
}
