import { useEffect } from 'react';

/** Scrolls the focused control into view when the visual viewport changes (e.g. mobile keyboard). */
export function useScrollInputIntoView(): void {
  useEffect(() => {
    const handler = (): void => {
      const focused = document.activeElement;
      if (
        !focused ||
        !(focused instanceof HTMLElement) ||
        (focused.tagName !== 'INPUT' && focused.tagName !== 'TEXTAREA' && focused.tagName !== 'SELECT')
      ) {
        return;
      }
      setTimeout(() => {
        focused.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 100);
    };

    window.visualViewport?.addEventListener('resize', handler);
    return () => window.visualViewport?.removeEventListener('resize', handler);
  }, []);
}
