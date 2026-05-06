import { create } from 'zustand';

export interface ActiveCallState {
  callId: string;
  conversationId: string;
  peerId: number;
  peerName: string;
  peerAvatar: string;
  callType: 'audio' | 'video';
  isInitiator: boolean;
  status: 'calling' | 'active' | 'ended';
}

interface CallStore {
  activeCall: ActiveCallState | null;
  isMuted: boolean;
  isVideoOff: boolean;
  isPeerMuted: boolean;
  isPeerVideoOff: boolean;
  isScreenSharing: boolean;
  openCall: (call: Omit<ActiveCallState, 'status'>) => void;
  setStatus: (status: ActiveCallState['status']) => void;
  setMuted: (v: boolean) => void;
  setVideoOff: (v: boolean) => void;
  setPeerMuted: (v: boolean) => void;
  setPeerVideoOff: (v: boolean) => void;
  setScreenSharing: (v: boolean) => void;
  closeCall: () => void;
}

export const useCallStore = create<CallStore>((set) => ({
  activeCall: null,
  isMuted: false,
  isVideoOff: false,
  isPeerMuted: false,
  isPeerVideoOff: false,
  isScreenSharing: false,

  openCall: (call) =>
    set({
      activeCall: { ...call, status: 'calling' },
      isMuted: false,
      isVideoOff: false,
      isPeerMuted: false,
      isPeerVideoOff: false,
      isScreenSharing: false,
    }),

  setStatus: (status) =>
    set((s) => (s.activeCall ? { activeCall: { ...s.activeCall, status } } : {})),

  setMuted: (isMuted) => set({ isMuted }),
  setVideoOff: (isVideoOff) => set({ isVideoOff }),
  setPeerMuted: (isPeerMuted) => set({ isPeerMuted }),
  setPeerVideoOff: (isPeerVideoOff) => set({ isPeerVideoOff }),
  setScreenSharing: (isScreenSharing) => set({ isScreenSharing }),

  closeCall: () =>
    set({
      activeCall: null,
      isMuted: false,
      isVideoOff: false,
      isPeerMuted: false,
      isPeerVideoOff: false,
      isScreenSharing: false,
    }),
}));
