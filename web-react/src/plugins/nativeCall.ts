import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type NativeIncomingCallPayload = {
  callId: string;
  callerId?: string;
  conversationId?: string;
  callType?: 'audio' | 'video';
  callerName?: string;
  callerAvatar?: string | null;
  url?: string;
};

export type NativeCallActionPayload = {
  callId: string;
};

export type NativeOngoingCallOptions = {
  callId: string;
  peerName?: string;
  callType?: 'audio' | 'video';
  callKind?: 'direct' | 'group';
  /** Override: video track currently publishing (camera on). */
  hasVideo?: boolean;
};

export interface NativeCallPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  /** Открыть системные настройки уведомлений приложения (Android / iOS). */
  openNotificationSettings?(): Promise<void>;
  endCall(options: { callId: string }): Promise<void>;
  /**
   * Hold the process + audio under screen lock / background (Android FGS, iOS CallKit).
   * Call when LiveKit status becomes `active`; stop via stopOngoing / endCall.
   */
  startOngoing?(options: NativeOngoingCallOptions): Promise<void>;
  stopOngoing?(options?: { callId?: string }): Promise<void>;
  /** Системный рингтон (обходит autoplay Web Audio). */
  playRingtone(): Promise<void>;
  stopRingtone(): Promise<void>;
  registerVoip?(): Promise<{ token?: string | null }>;
  addListener(
    eventName: 'incoming' | 'accepted' | 'declined' | 'ended' | 'voipToken' | 'hangupRequested',
    listenerFunc: (event: NativeIncomingCallPayload & NativeCallActionPayload & { token?: string }) => void,
  ): Promise<PluginListenerHandle>;
}

const NativeCall = registerPlugin<NativeCallPlugin>('NativeCall', {
  web: () => ({
    async isSupported() {
      return { supported: false };
    },
    async openNotificationSettings() {
      /* no-op on web */
    },
    async endCall() {
      /* no-op on web */
    },
    async startOngoing() {
      /* no-op on web — browsers cannot keep WebRTC under lock */
    },
    async stopOngoing() {
      /* no-op on web */
    },
    async playRingtone() {
      /* no-op on web */
    },
    async stopRingtone() {
      /* no-op on web */
    },
    async addListener() {
      return { remove: async () => undefined };
    },
  }),
});

export { NativeCall };
