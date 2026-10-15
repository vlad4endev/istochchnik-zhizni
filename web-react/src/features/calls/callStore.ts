import { create } from 'zustand';

import type { CallMediaType, CallPublic } from './callsApi';

export interface ActiveCallState {
  callId: string;
  /** Empty for standalone Telemost-style meetings (no chat). */
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
  /** Prefs from pre-join lobby (join link / create meeting). Applied on LiveKit connect. */
  initialMicOn?: boolean;
  initialCamOn?: boolean;
}

interface CallStore {
  activeCall: ActiveCallState | null;
  /** Full-screen call UI hidden; LiveKit stays connected — show return bar. */
  uiMinimized: boolean;
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
  minimizeCall: () => void;
  expandCall: () => void;
  closeCall: () => void;
  hydrateFromPublic: (call: CallPublic, extras: Partial<ActiveCallState>) => void;
}

export const useCallStore = create<CallStore>((set) => ({
  activeCall: null,
  uiMinimized: false,
  isMuted: false,
  isVideoOff: false,
  isScreenSharing: false,

  openCall: (call) =>
    set({
      activeCall: {
        ...call,
        callKind: call.callKind ?? 'direct',
        status: call.status ?? 'calling',
        initialMicOn: call.initialMicOn ?? true,
        initialCamOn: call.initialCamOn ?? call.callType === 'video',
      },
      uiMinimized: false,
      isMuted: call.initialMicOn === false,
      isVideoOff: call.initialCamOn === false || call.callType === 'audio',
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

  minimizeCall: () =>
    set((s) => {
      if (!s.activeCall) return s;
      if (s.activeCall.status === 'ringing_in' || s.activeCall.status === 'ended') return s;
      return { uiMinimized: true };
    }),

  expandCall: () => set({ uiMinimized: false }),

  closeCall: () =>
    set({
      activeCall: null,
      uiMinimized: false,
      isMuted: false,
      isVideoOff: false,
      isScreenSharing: false,
    }),

  hydrateFromPublic: (call, extras) =>
    set((s) => {
      const sameCall = s.activeCall?.callId === call.id;
      return {
        uiMinimized: sameCall ? s.uiMinimized : false,
        activeCall: {
          callId: call.id,
          // extras.conversationId wins (e.g. link-join clears chat id so guests aren't sent into a foreign group)
          conversationId:
            extras.conversationId !== undefined
              ? extras.conversationId
              : (call.conversationId ?? ''),
          peerId: extras.peerId ?? s.activeCall?.peerId ?? 0,
          peerName:
            extras.peerName ??
            (call.title?.trim() || s.activeCall?.peerName || 'Участник'),
          peerAvatar: extras.peerAvatar ?? s.activeCall?.peerAvatar ?? '',
          callType: call.mediaType,
          isInitiator: extras.isInitiator ?? s.activeCall?.isInitiator ?? false,
          status:
            extras.status ??
            (call.status === 'active' || call.status === 'waiting' ? 'active' : 'calling'),
          callKind: call.type,
          inviteUrl: call.inviteUrl ?? extras.inviteUrl ?? s.activeCall?.inviteUrl ?? null,
          // Не затирать уже выданный токен при navigate на /call/:id
          livekitUrl: extras.livekitUrl ?? (sameCall ? s.activeCall?.livekitUrl ?? null : null),
          livekitToken: extras.livekitToken ?? (sameCall ? s.activeCall?.livekitToken ?? null : null),
          initialMicOn:
            extras.initialMicOn ??
            (sameCall ? s.activeCall?.initialMicOn : undefined) ??
            true,
          initialCamOn:
            extras.initialCamOn ??
            (sameCall ? s.activeCall?.initialCamOn : undefined) ??
            call.mediaType === 'video',
        },
        isMuted: sameCall
          ? s.isMuted
          : extras.initialMicOn === false,
        isVideoOff: sameCall
          ? s.isVideoOff
          : extras.initialCamOn === false || call.mediaType === 'audio',
        isScreenSharing: sameCall ? s.isScreenSharing : false,
      };
    }),
}));
