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

export interface NativeCallPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  endCall(options: { callId: string }): Promise<void>;
  registerVoip?(): Promise<{ token?: string | null }>;
  addListener(
    eventName: 'incoming' | 'accepted' | 'declined' | 'ended' | 'voipToken',
    listenerFunc: (event: NativeIncomingCallPayload & NativeCallActionPayload & { token?: string }) => void,
  ): Promise<PluginListenerHandle>;
}

const NativeCall = registerPlugin<NativeCallPlugin>('NativeCall', {
  web: () => ({
    async isSupported() {
      return { supported: false };
    },
    async endCall() {
      /* no-op on web */
    },
    async addListener() {
      return { remove: async () => undefined };
    },
  }),
});

export { NativeCall };
