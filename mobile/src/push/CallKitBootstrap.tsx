import { useNavigation } from '@react-navigation/native';
import { useEffect } from 'react';
import { Alert, NativeModules } from 'react-native';

import { native } from '../../modules/expo-callkit/src';
import { declineCall, endCall } from '../api/calls';
import { saveVoipToken } from '../api/push';
import { answerIncomingCall } from '../lib/answerCall';
import { callKitHas, callKitReportEnded, callKitRequestEnd, forgetCallKitReported, markCallKitReported } from '../lib/callKit';
import { useAuthStore } from '../stores/authStore';
import { useCallStore } from '../stores/callStore';
import { startCallKitBridge } from './callKitBridge';
import { getDeviceId } from './registerPush';

type Nav = { navigate: (screen: 'Call') => void };
type WebRtcAudio = { audioSessionDidActivate?: () => void; audioSessionDidDeactivate?: () => void };

/** iPhone: подключает системный экран звонка (CallKit) после входа в аккаунт. На других платформах ничего не делает. */
export function CallKitBootstrap() {
  const navigation = useNavigation<Nav>();
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!native || !token) return;
    return startCallKitBridge({
      native,
      deviceId: getDeviceId,
      saveVoipToken,
      answer: (target) => answerIncomingCall(navigation, target),
      decline: declineCall,
      endCallApi: (id) => endCall(id),
      getState: () => useCallStore.getState(),
      subscribe: (listener) => useCallStore.subscribe(listener),
      closeActiveCall: () => useCallStore.getState().closeCall(),
      clearIncoming: () => useCallStore.getState().setIncoming(null),
      markReported: markCallKitReported,
      forgetReported: forgetCallKitReported,
      callKitHas,
      reportEnded: callKitReportEnded,
      requestEnd: callKitRequestEnd,
      audioSession: (active) => {
        // LiveKit/WebRTC должен знать, когда система включила звук звонка.
        const rtc = (NativeModules as Record<string, unknown>).WebRTCModule as WebRtcAudio | undefined;
        try {
          if (active) rtc?.audioSessionDidActivate?.();
          else rtc?.audioSessionDidDeactivate?.();
        } catch {
          /* WebRTC не готов — звук настроится при подключении */
        }
      },
      alert: (message) => Alert.alert('Не удалось принять звонок', message),
    });
  }, [token, navigation]);

  return null;
}
