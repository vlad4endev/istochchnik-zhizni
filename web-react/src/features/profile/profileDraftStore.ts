import { create } from 'zustand';

interface ProfileDraftState {
  hasActivePostDraft: boolean;
  setHasActivePostDraft: (v: boolean) => void;
}

export const useProfileDraftStore = create<ProfileDraftState>((set) => ({
  hasActivePostDraft: false,
  setHasActivePostDraft: (v) => set({ hasActivePostDraft: v }),
}));
