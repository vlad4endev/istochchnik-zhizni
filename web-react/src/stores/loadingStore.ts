import { create } from 'zustand';

type LoadingState = {
  count: number;
  isLoading: boolean;
  start: () => void;
  done: () => void;
};

export const useLoadingStore = create<LoadingState>((set) => ({
  count: 0,
  isLoading: false,
  start: () =>
    set((state) => {
      const count = state.count + 1;
      return { count, isLoading: count > 0 };
    }),
  done: () =>
    set((state) => {
      const count = Math.max(0, state.count - 1);
      return { count, isLoading: count > 0 };
    }),
}));
