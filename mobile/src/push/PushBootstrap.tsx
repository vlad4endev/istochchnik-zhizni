import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef } from 'react';
import { Alert, Linking } from 'react-native';

import { declineCall, fetchCallStatus } from '../api/calls';
import { answerIncomingCall } from '../lib/answerCall';
import { parseIncomingCallLink } from '../lib/callLink';
import { intentFromNotification, parseCallPush, type CallIntent } from '../lib/callPush';
import {
  callScreenAvailable,
  dismissIncomingCallScreen,
  fullScreenAllowed,
  openFullScreenSettings,
  shouldPromptFullScreen,
} from '../lib/callScreen';
import { storage } from '../lib/storage';
import { useAuthStore } from '../stores/authStore';
import { useCallStore } from '../stores/callStore';
import { getNotifications } from './pushNative';
import { registerPush, watchTokenRefresh } from './registerPush';
import { runCallIntent } from './runCallIntent';

type Nav = { navigate: (screen: 'Call') => void };

const FULL_SCREEN_PROMPTED_KEY = 'fullscreen_call_prompted';

/**
 * Включает пуши после входа: регистрирует устройство на сервере и обрабатывает действия по звонку —
 * нажатие на уведомление или его кнопки («Принять», «Отклонить»), в том числе когда приложение
 * запустилось из закрытого состояния.
 */
export function PushBootstrap() {
  const navigation = useNavigation<Nav>();
  const token = useAuthStore((s) => s.token);
  const handled = useRef(new Set<string>());

  // Один и тот же набор действий для уведомления и для ссылки от полноэкранного звонка.
  const run = (intent: CallIntent) =>
    runCallIntent(intent, {
      fetchStatus: fetchCallStatus,
      decline: declineCall,
      answer: (target) => answerIncomingCall(navigation, target),
      showIncoming: (call) => useCallStore.getState().setIncoming(call),
      dismissNative: dismissIncomingCallScreen,
      alert: (title, message) => Alert.alert(title, message),
    });
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!token) return;
    void registerPush().then((result) => {
      // Android 14+: пользователь мог запретить полноэкранные звонки — один раз подсказываем, как включить.
      if (result === 'denied') {
        Alert.alert(
          'Уведомления выключены',
          'Без них входящие звонки и сообщения не придут, пока приложение закрыто. Включите уведомления в настройках.',
          [{ text: 'Позже', style: 'cancel' }, { text: 'Открыть настройки', onPress: () => void Linking.openSettings() }],
        );
        return;
      }
      if (result !== 'ok') return;
      const prompt = shouldPromptFullScreen({
        available: callScreenAvailable,
        allowed: fullScreenAllowed(),
        alreadyPrompted: storage.getString(FULL_SCREEN_PROMPTED_KEY) === '1',
      });
      if (!prompt) return;
      storage.set(FULL_SCREEN_PROMPTED_KEY, '1');
      Alert.alert(
        'Звонки на весь экран',
        'Чтобы входящий звонок открывался на весь экран, даже когда телефон заблокирован, разрешите это в настройках приложения.',
        [
          { text: 'Позже', style: 'cancel' },
          { text: 'Открыть настройки', onPress: openFullScreenSettings },
        ],
      );
    });
    return watchTokenRefresh();
  }, [token]);

  // Нажатие на системное уведомление о звонке (iPhone/запасной путь Android).
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
      await runRef.current(intent);
    };

    const sub = N.addNotificationResponseReceivedListener((r) => void handle(r));
    void N.getLastNotificationResponseAsync().then((r) => r && void handle(r));
    return () => sub.remove();
  }, [token]);

  // Android: полноэкранное уведомление открывает приложение по ссылке istochnik://incoming-call?…
  useEffect(() => {
    if (!token) return;
    const onUrl = (url: string | null) => {
      const intent = parseIncomingCallLink(url);
      if (!intent) return;
      const key = `link:${intent.call.callId}:${intent.type}`;
      if (handled.current.has(key)) return;
      handled.current.add(key);
      void runRef.current(intent);
    };
    void Linking.getInitialURL().then(onUrl);
    const sub = Linking.addEventListener('url', (e) => onUrl(e.url));
    return () => sub.remove();
  }, [token]);

  return null;
}
