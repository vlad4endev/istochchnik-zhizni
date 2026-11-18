import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { declineCall, fetchCallStatus } from '../api/calls';
import { answerIncomingCall } from '../lib/answerCall';
import { decideIntent, intentFromNotification, parseCallPush } from '../lib/callPush';
import { useAuthStore } from '../stores/authStore';
import { useCallStore } from '../stores/callStore';
import { getNotifications } from './pushNative';
import { registerPush, watchTokenRefresh } from './registerPush';

type Nav = { navigate: (screen: 'Call') => void };

/**
 * Включает пуши после входа: регистрирует устройство на сервере и обрабатывает нажатия на
 * уведомление «Входящий звонок» — в том числе когда приложение запустилось из закрытого состояния.
 */
export function PushBootstrap() {
  const navigation = useNavigation<Nav>();
  const token = useAuthStore((s) => s.token);
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (!token) return;
    void registerPush();
    return watchTokenRefresh();
  }, [token]);

  useEffect(() => {
    const N = getNotifications();
    if (!N || !token) return;

    // Пока приложение открыто, звонок показывает наш экран, а не системное уведомление.
    N.setNotificationHandler({
      handleNotification: async (n) => {
        const isCall = parseCallPush(n.request.content.data)?.kind === 'incoming';
        return {
          shouldShowBanner: !isCall,
          shouldShowList: !isCall,
          shouldPlaySound: !isCall,
          shouldSetBadge: false,
        };
      },
    });

    const handle = async (resp: import('expo-notifications').NotificationResponse) => {
      const key = `${resp.notification.request.identifier}:${resp.actionIdentifier}`;
      if (handled.current.has(key)) return;
      handled.current.add(key);

      const actionId = resp.actionIdentifier === N.DEFAULT_ACTION_IDENTIFIER ? null : resp.actionIdentifier;
      const intent = intentFromNotification(actionId, resp.notification.request.content.data);
      if (!intent) return;

      void N.dismissNotificationAsync(resp.notification.request.identifier).catch(() => undefined);
      N.clearLastNotificationResponse();

      const decision = decideIntent(intent, await fetchCallStatus(intent.call.callId));
      const store = useCallStore.getState();
      if (decision.action === 'call-ended') {
        Alert.alert('Звонок', 'Звонок уже завершён.');
        return;
      }
      const c = decision.call;
      if (decision.action === 'decline') {
        await declineCall(c.callId).catch(() => undefined);
        return;
      }
      if (decision.action === 'show-incoming') {
        store.setIncoming({
          callId: c.callId,
          callerId: c.callerId,
          callerName: c.callerName,
          callerAvatar: c.callerAvatar,
          callType: c.callType,
          conversationId: c.conversationId,
        });
        return;
      }
      const err = await answerIncomingCall(navigation, {
        callId: c.callId,
        callerName: c.callerName,
        callType: c.callType,
        conversationId: c.conversationId,
      });
      if (err) Alert.alert('Не удалось принять звонок', err);
    };

    const sub = N.addNotificationResponseReceivedListener((r) => void handle(r));
    // Приложение запущено нажатием на уведомление из закрытого состояния.
    void N.getLastNotificationResponseAsync().then((r) => r && void handle(r));
    return () => sub.remove();
  }, [token, navigation]);

  return null;
}
