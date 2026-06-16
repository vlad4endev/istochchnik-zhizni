import { create } from 'zustand';

import { getColorScheme, setColorScheme as persistColorScheme } from '../lib/storage';
import type { AppSettings } from '../types';

interface SettingsState {
  colorScheme: AppSettings['colorScheme'];
  setColorScheme: (scheme: AppSettings['colorScheme']) => void;
  hydrate: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  colorScheme: 'system',
  hydrate: () => {
    set({ colorScheme: getColorScheme() });
  },
  setColorScheme: (scheme) => {
    persistColorScheme(scheme);
    set({ colorScheme: scheme });
  },
}));
