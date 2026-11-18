import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { acceptCall, declineCall } from '../../api/calls';
import { resolvePublicUrl } from '../../lib/resolvePublicUrl';
import { useCallStore } from '../../stores/callStore';
import { ChatAvatar } from './ChatAvatar';

const RING_PATTERN = [0, 900, 700];

/** Входящий личный звонок поверх любого экрана: принять или отклонить. */
export function IncomingCallOverlay() {
  const navigation = useNavigation<{ navigate: (screen: 'Call') => void }>();
  const incoming = useCallStore((s) => s.incoming);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const callId = incoming?.callId;

  // Пока звонит — вибрация по кругу; останавливаем при любом исходе.
  useEffect(() => {
    if (!callId) return;
    Vibration.vibrate(RING_PATTERN, true);
    return () => Vibration.cancel();
  }, [callId]);

  useEffect(() => {
    setBusy(null);
    setError(null);
  }, [callId]);

  if (!incoming) return null;

  const accept = async () => {
    setBusy('accept');
    setError(null);
    try {
      await acceptCall(incoming.callId);
      useCallStore.getState().openCall({
        callId: incoming.callId,
        kind: 'direct',
        mediaType: incoming.callType,
        title: incoming.callerName,
        peerName: incoming.callerName,
        isInitiator: false,
        conversationId: incoming.conversationId,
        phase: 'connecting',
      });
      useCallStore.getState().setIncoming(null);
      navigation.navigate('Call');
    } catch (e) {
      setBusy(null);
      setError(e instanceof Error ? e.message : 'Не удалось принять звонок');
    }
  };

  const decline = async () => {
    setBusy('decline');
    try {
      await declineCall(incoming.callId);
    } catch {
      /* звонок мог уже завершиться */
    }
    useCallStore.getState().setIncoming(null);
  };

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={() => void decline()}>
      <SafeAreaView style={styles.root}>
        <View style={styles.center} accessibilityLiveRegion="assertive">
          <ChatAvatar
            name={incoming.callerName}
            imageUrl={resolvePublicUrl(incoming.callerAvatar)}
            seed={String(incoming.callerId)}
            size={120}
          />
          <Text style={styles.name} accessibilityRole="header">
            {incoming.callerName}
          </Text>
          <Text style={styles.sub}>
            {incoming.callType === 'video' ? 'Входящий видеозвонок' : 'Входящий аудиозвонок'}
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
        <View style={styles.actions}>
          <View style={styles.actionCol}>
            <Pressable
              onPress={() => void decline()}
              disabled={busy != null}
              accessibilityRole="button"
              accessibilityLabel="Отклонить звонок"
              style={[styles.btn, { backgroundColor: '#DC2626' }]}
            >
              {busy === 'decline' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              )}
            </Pressable>
            <Text style={styles.actionLabel}>Отклонить</Text>
          </View>
          <View style={styles.actionCol}>
            <Pressable
              onPress={() => void accept()}
              disabled={busy != null}
              accessibilityRole="button"
              accessibilityLabel="Принять звонок"
              style={[styles.btn, { backgroundColor: '#16A34A' }]}
            >
              {busy === 'accept' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name={incoming.callType === 'video' ? 'videocam' : 'call'} size={30} color="#fff" />
              )}
            </Pressable>
            <Text style={styles.actionLabel}>Принять</Text>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F0F10' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 10 },
  name: { fontSize: 28, fontWeight: '800', color: '#fff', textAlign: 'center', marginTop: 12 },
  sub: { fontSize: 17, color: 'rgba(255,255,255,0.75)' },
  error: { fontSize: 15, color: '#FCA5A5', textAlign: 'center', marginTop: 8 },
  actions: { flexDirection: 'row', justifyContent: 'space-evenly', paddingBottom: 48 },
  actionCol: { alignItems: 'center', gap: 10 },
  btn: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
