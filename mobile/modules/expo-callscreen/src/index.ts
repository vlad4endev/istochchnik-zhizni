import { requireOptionalNativeModule } from 'expo-modules-core';

type Native = {
  showIncomingCall(
    callId: string,
    callerName: string,
    callType: string,
    conversationId: string,
    callerId: string,
    callerAvatar: string,
    ttlSec: number,
  ): boolean;
  dismissIncomingCall(callId: string): void;
  setShowOverLockScreen(enabled: boolean): void;
  canUseFullScreenIntent(): boolean;
  openFullScreenIntentSettings(): void;
};

/** Нативный модуль есть только в сборке для Android; в Expo Go и на iPhone это null. */
export const native: Native | null = requireOptionalNativeModule<Native>('ExpoCallScreen');
