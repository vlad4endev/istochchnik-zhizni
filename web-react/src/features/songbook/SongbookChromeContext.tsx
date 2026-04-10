import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type SongbookChromeContextValue = {
  /** Глубокий чёрный фон для модуля песен (режим сцены). */
  stageMode: boolean;
  setStageMode: (v: boolean) => void;
  toggleStageMode: () => void;
};

const SongbookChromeContext = createContext<SongbookChromeContextValue | null>(null);

export function SongbookChromeProvider({ children }: { children: ReactNode }) {
  const [stageMode, setStageMode] = useState(false);
  const toggleStageMode = useCallback(() => setStageMode((s) => !s), []);

  const value = useMemo(
    () => ({ stageMode, setStageMode, toggleStageMode }),
    [stageMode, toggleStageMode],
  );

  return <SongbookChromeContext.Provider value={value}>{children}</SongbookChromeContext.Provider>;
}

export function useSongbookChrome(): SongbookChromeContextValue {
  const v = useContext(SongbookChromeContext);
  if (!v) {
    return {
      stageMode: false,
      setStageMode: () => {},
      toggleStageMode: () => {},
    };
  }
  return v;
}
