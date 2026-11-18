import { requireOptionalNativeModule } from 'expo-modules-core';

export type AnswerCallEvent = {
  callId: string;
  callerName: string;
  callType: 'audio' | 'video';
  conversationId: string;
  callerId: string;
  callerAvatar: string;
};
export type EndCallEvent = { callId: string; answered: boolean };

type Events = {
  onVoipToken: { token: string };
  onIncomingCall: { callId: string };
  onAnswerCall: AnswerCallEvent;
  onEndCall: EndCallEvent;
  onAudioSession: { active: boolean };
};

export type CallKitEndReason = 'remoteEnded' | 'unanswered' | 'failed' | 'answeredElsewhere' | 'declinedElsewhere';

type Native = {
  getVoipToken(): string | null;
  isCallActive(callId: string): boolean;
  reportCallEnded(callId: string, reason: CallKitEndReason): void;
  requestEndCall(callId: string): Promise<boolean>;
  addListener<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): { remove(): void };
};

/** Нативный модуль есть только в сборке для iPhone; в Expo Go и на Android это null. */
export const native: Native | null = requireOptionalNativeModule<Native>('ExpoCallKit');
export const isCallKitAvailable: boolean = native != null;
