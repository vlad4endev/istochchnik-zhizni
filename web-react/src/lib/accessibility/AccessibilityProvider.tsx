import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

import { applyAccessibilityToDocument } from './applyDocumentAccessibility';
import { applySystemFontScaleToDocument } from './syncSystemFontScale';
import { A11Y_DEFAULTS } from './constants';
import { syncHideImages } from './hideImagesSync';
import { loadAccessibilityState, saveAccessibilityState } from './storage';
import type { AccessibilityState } from './types';

type AccessibilityContextValue = {
  state: AccessibilityState;
  setA11yState: Dispatch<SetStateAction<AccessibilityState>>;
  patchA11y: (partial: Partial<AccessibilityState>) => void;
  resetA11y: () => void;
};

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

function HideImagesObserver({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;

    if (!enabled) {
      syncHideImages(root, false);
      return;
    }

    let timeoutId = 0;
    const run = () => {
      syncHideImages(root, true);
    };
    run();

    const mo = new MutationObserver(() => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(run, 120);
    });
    mo.observe(root, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(timeoutId);
      mo.disconnect();
      syncHideImages(root, false);
    };
  }, [enabled]);

  return null;
}

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [state, setA11yState] = useState<AccessibilityState>(() => loadAccessibilityState());

  useLayoutEffect(() => {
    applyAccessibilityToDocument(state);
  }, [state]);

  useEffect(() => {
    const onLayout = () => applySystemFontScaleToDocument();
    window.addEventListener('orientationchange', onLayout);
    window.addEventListener('resize', onLayout);
    const vv = window.visualViewport;
    vv?.addEventListener?.('resize', onLayout);
    return () => {
      window.removeEventListener('orientationchange', onLayout);
      window.removeEventListener('resize', onLayout);
      vv?.removeEventListener?.('resize', onLayout);
    };
  }, []);

  useEffect(() => {
    saveAccessibilityState(state);
  }, [state]);

  const patchA11y = useCallback((partial: Partial<AccessibilityState>) => {
    setA11yState((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetA11y = useCallback(() => {
    setA11yState({ ...A11Y_DEFAULTS });
  }, []);

  const value = useMemo(
    () => ({ state, setA11yState, patchA11y, resetA11y }),
    [state, patchA11y, resetA11y],
  );

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
      <HideImagesObserver enabled={state.hideImages} />
    </AccessibilityContext.Provider>
  );
}

export function useAccessibilitySettings(): AccessibilityContextValue {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) {
    throw new Error('useAccessibilitySettings must be used within AccessibilityProvider');
  }
  return ctx;
}
