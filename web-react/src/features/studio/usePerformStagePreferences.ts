import { useCallback, useState } from 'react';

const STORAGE_KEY = 'perform-stage-prefs-v1';

export type PerformStagePrefs = {
  fontSize: number;
  stageDark: boolean;
  chordsVisible: boolean;
  musicianNotesVisible: boolean;
  focusMode: boolean;
};

const DEFAULTS: PerformStagePrefs = {
  fontSize: 22,
  stageDark: true,
  chordsVisible: true,
  musicianNotesVisible: true,
  focusMode: false,
};

function loadPrefs(): PerformStagePrefs {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<PerformStagePrefs>;
    return {
      fontSize:
        typeof parsed.fontSize === 'number' && parsed.fontSize >= 14 && parsed.fontSize <= 44
          ? parsed.fontSize
          : DEFAULTS.fontSize,
      stageDark: typeof parsed.stageDark === 'boolean' ? parsed.stageDark : DEFAULTS.stageDark,
      chordsVisible:
        typeof parsed.chordsVisible === 'boolean' ? parsed.chordsVisible : DEFAULTS.chordsVisible,
      musicianNotesVisible:
        typeof parsed.musicianNotesVisible === 'boolean'
          ? parsed.musicianNotesVisible
          : DEFAULTS.musicianNotesVisible,
      focusMode: typeof parsed.focusMode === 'boolean' ? parsed.focusMode : DEFAULTS.focusMode,
    };
  } catch {
    return DEFAULTS;
  }
}

function savePrefs(prefs: PerformStagePrefs): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / private mode
  }
}

export function usePerformStagePreferences() {
  const [prefs, setPrefs] = useState<PerformStagePrefs>(loadPrefs);

  const update = useCallback((patch: Partial<PerformStagePrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  return { prefs, update };
}
