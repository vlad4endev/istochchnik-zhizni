import { create } from 'zustand';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

interface PwaStore {
  deferredPrompt: BeforeInstallPromptEvent | null;
  setDeferredPrompt: (event: BeforeInstallPromptEvent | null) => void;
  isInstallable: boolean;
  setInstallable: (value: boolean) => void;
  isInstalled: boolean;
  setInstalled: (value: boolean) => void;
}

export const usePwaStore = create<PwaStore>((set) => ({
  deferredPrompt: null,
  setDeferredPrompt: (event) => set({ deferredPrompt: event }),
  isInstallable: false,
  setInstallable: (value) => set({ isInstallable: value }),
  isInstalled: false,
  setInstalled: (value) => set({ isInstalled: value }),
}));
