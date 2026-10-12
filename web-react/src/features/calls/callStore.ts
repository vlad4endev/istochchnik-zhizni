import { create } from 'zustand';

import type { CallMediaType, CallPublic } from './callsApi';

export interface ActiveCallState {
  callId: string;
  conversationId: string;
  peerId: number;
  peerName: string;
  peerAvatar: string;
  callType: CallMediaType;
  isInitiator: boolean;
  /** calling = outgoing ring; ringing_in = awaiting accept UI; active = in LiveKit room */
  status: 'calling' | 'ringing_in' | 'active' | 'ended';
  callKind: 'direct' | 'group';
  inviteUrl?: string | null;
  livekitUrl?: string | null;
  livekitToken?: string | null;
}

interface CallStore {
  activeCall: ActiveCallState | null;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  openCall: (call: Omit<ActiveCallState, 'status'> & { status?: ActiveCallState['status'] }) => void;
  setStatus: (status: ActiveCallState['status']) => void;
  setLiveKitCreds: (url: string, token: string) => void;
  setInviteUrl: (url: string | null) => void;
  setMuted: (v: boolean) => void;
  setVideoOff: (v: boolean) => void;
  setScreenSharing: (v: boolean) => void;
  closeCall: () => void;
  hydrateFromPublic: (call: CallPublic, extras: Partial<ActiveCallState>) => void;
}

export const useCallStore = create<CallStore>((set) => ({
  activeCall: null,
  isMuted: false,
  isVideoOff: false,
  isScreenSharing: false,

  openCall: (call) =>
    set({
      activeCall: {
        ...call,
        callKind: call.callKind ?? 'direct',
        status: call.status ?? 'calling',
      },
      isMuted: false,
      isVideoOff: call.callType === 'audio',
      isScreenSharing: false,
    }),

  setStatus: (status) =>
    set((s) => (s.activeCall ? { activeCall: { ...s.activeCall, status } } : {})),

  setLiveKitCreds: (livekitUrl, livekitToken) =>
    set((s) =>
      s.activeCall ? { activeCall: { ...s.activeCall, livekitUrl, livekitToken } } : {},
    ),

  setInviteUrl: (inviteUrl) =>
    set((s) => (s.activeCall ? { activeCall: { ...s.activeCall, inviteUrl } } : {})),

  setMuted: (isMuted) => set({ isMuted }),
  setVideoOff: (isVideoOff) => set({ isVideoOff }),
  setScreenSharing: (isScreenSharing) => set({ isScreenSharing }),

  closeCall: () =>
    set({
      activeCall: null,
      isMuted: false,
      isVideoOff: false,
      isScreenSharing: false,
    }),

  hydrateFromPublic: (call, extras) =>
    set({
      activeCall: {
        callId: call.id,
        conversationId: call.conversationId,
        peerId: extras.peerId ?? 0,
        peerName: extras.peerName ?? 'Участник',
        peerAvatar: extras.peerAvatar ?? '',
        callType: call.mediaType,
        isInitiator: extras.isInitiator ?? false,
        status: extras.status ?? (call.status === 'active' || call.status === 'waiting' ? 'active' : 'calling'),
        callKind: call.type,
        inviteUrl: call.inviteUrl ?? extras.inviteUrl ?? null,
        livekitUrl: extras.livekitUrl ?? null,
        livekitToken: extras.livekitToken ?? null,
      },
      isMuted: false,
      isVideoOff: call.mediaType === 'audio',
      isScreenSharing: false,
    }),
}));
