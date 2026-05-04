import { useEffect } from 'react';

function isFormField(el: HTMLElement): boolean {
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Scrolls the focused control into view when the visual viewport changes (e.g. mobile keyboard). */
export function useScrollInputIntoView(): void {
  useEffect(() => {
    const scrollField = (el: HTMLElement, delayMs: number): void => {
      if (!isFormField(el)) return;
      setTimeout(() => {
        el.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest',
        });
      }, delayMs);
    };

    const handleVisualResize = (): void => {
      const focused = document.activeElement;
      if (!focused || !(focused instanceof HTMLElement)) return;
      scrollField(focused, 100);
    };

    const handleFocusIn = (e: Event): void => {
      if (!(e.target instanceof HTMLElement)) return;
      scrollField(e.target, 350);
    };

    window.visualViewport?.addEventListener('resize', handleVisualResize);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      window.visualViewport?.removeEventListener('resize', handleVisualResize);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, []);
}
