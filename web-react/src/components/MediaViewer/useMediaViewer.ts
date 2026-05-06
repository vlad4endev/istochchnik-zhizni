import { create } from 'zustand';

export interface MediaItem {
  id: string;
  type: 'photo' | 'video';
  src: string;
  thumb?: string;
  caption?: string;
  sender?: { name: string; avatar?: string; initials: string; color?: string };
  date?: string;
}

interface MediaViewerStore {
  items: MediaItem[];
  index: number;
  open: boolean;
  openViewer: (items: MediaItem[], startIndex?: number) => void;
  closeViewer: () => void;
  navigate: (dir: 1 | -1) => void;
  setIndex: (i: number) => void;
}

export const useMediaViewer = create<MediaViewerStore>((set, get) => ({
  items: [],
  index: 0,
  open: false,
  openViewer: (items, startIndex = 0) => set({ items, index: startIndex, open: true }),
  closeViewer: () => set({ open: false }),
  navigate: (dir) => {
    const { index, items } = get();
    const next = index + dir;
    if (next >= 0 && next < items.length) set({ index: next });
  },
  setIndex: (i) => set({ index: i }),
}));
