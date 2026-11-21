import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  cancelCall,
  endCall,
  fetchCallToken,
  formatInviteText,
  joinByInvite,
  type CallTokenResponse,
} from '../api/calls';
import { ActionSheet } from '../components/messenger/ActionSheet';
import { disconnectMessage, elapsedLabel, gridColumns, isHardEnd, type ActiveCall } from '../lib/callState';
import { useRingback } from '../hooks/useRingback';
import { initialsOf } from '../lib/dashboardHome';
import { loadLiveKit, type LiveKitLoad } from '../lib/livekitNative';
import type { RootStackParamList } from '../navigation/types';
import { useCallStore } from '../stores/callStore';

type Lk = Extract<LiveKitLoad, { ok: true }>;

const BG = '#0F0F10';
const PANEL = '#1C1C1E';

/** Экран звонка: ожидание ответа, подключение к комнате LiveKit, участники и управление. */
export function CallScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const call = useCallStore((s) => s.active);
  const setPhase = useCallStore((s) => s.setPhase);
  const closeCall = useCallStore((s) => s.closeCall);
  const [creds, setCreds] = useState<CallTokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const lk = useMemo(() => loadLiveKit(), []);
  const isCalling = call?.phase === 'calling';
  useRingback(isCalling);
  const callingSince = useRef(Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isCalling) return;
    callingSince.current = Date.now();
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isCalling]);

  const leave = useCallback(() => {
    closeCall();
    if (navigation.canGoBack()) navigation.goBack();
  }, [closeCall, navigation]);

  // Закрытый звонок без активного состояния — просто уходим.
  useEffect(() => {
    if (!call) leave();
  }, [call, leave]);

  // Завершённый звонок показываем несколько секунд и закрываем.
  useEffect(() => {
    if (call?.phase !== 'ended') return;
    const id = setTimeout(leave, 2200);
    return () => clearTimeout(id);
  }, [call?.phase, leave]);

  const joinByLink = Boolean(call?.inviteToken && !call.isInitiator);
  const joinKey = joinByLink ? call?.inviteToken : call?.callId;
  const connecting = call?.phase === 'connecting';

  // Получаем доступ к комнате, когда звонок принят (или сразу — для встречи по ссылке).
  useEffect(() => {
    if (!call || call.phase !== 'connecting' || !lk.ok) return;
    let alive = true;
    setError(null);
    setCreds(null);
    void (async () => {
      try {
        const res = joinByLink ? await joinByInvite(call.inviteToken!) : await fetchCallToken(call.callId);
        if (!alive) return;
        // Для входа по ссылке настоящий id звонка известен только после входа.
        const realId = res.call?.id;
        if (realId && realId !== call.callId) {
          useCallStore.setState((s) => (s.active ? { active: { ...s.active, callId: realId } } : s));
        }
        setCreds(res);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Не удалось подключиться');
      }
    })();
    return () => {
      alive = false;
    };
    // attempt — повторная попытка по кнопке
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinKey, connecting, lk.ok, attempt]);

  if (!call) return <View style={styles.root} />;

  if (!lk.ok) {
    return (
      <Shell>
        <Center
          icon="phone-portrait-outline"
          title="Звонок откроется в браузере"
          text={lk.message}
        >
          {call.inviteUrl ? (
            <BigButton label="Открыть в браузере" onPress={() => void Linking.openURL(call.inviteUrl!)} />
          ) : null}
          <BigButton label="Закрыть" ghost onPress={leave} />
        </Center>
      </Shell>
    );
  }

  if (call.phase === 'ended') {
    return (
      <Shell>
        <Center icon="call" title={call.endedMessage ?? 'Звонок завершён'} text={call.title}>
          <BigButton label="Закрыть" onPress={leave} />
        </Center>
      </Shell>
    );
  }

  if (call.phase === 'calling') {
    return (
      <Shell>
        <Center icon={call.mediaType === 'video' ? 'videocam' : 'call'} title={call.peerName ?? call.title} text={`Вызов… ${elapsedLabel(callingSince.current, now)}`} pulse>
          <RoundButton
            icon="call"
            color="#DC2626"
            label="Отменить звонок"
            rotate
            onPress={() => {
              void cancelCall(call.callId).catch(() => undefined);
              leave();
            }}
          />
        </Center>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <Center icon="alert-circle-outline" title="Не удалось подключиться" text={error}>
          <BigButton label="Повторить" onPress={() => setAttempt((n) => n + 1)} />
          {call.inviteUrl ? (
            <BigButton label="Открыть в браузере" ghost onPress={() => void Linking.openURL(call.inviteUrl!)} />
          ) : null}
          <BigButton label="Закрыть" ghost onPress={leave} />
        </Center>
      </Shell>
    );
  }

  if (!creds) {
    return (
      <Shell>
        <Center icon="videocam" title={call.title} text="Подключаемся…" pulse>
          <ActivityIndicator color="#fff" />
          <BigButton label="Отмена" ghost onPress={leave} />
        </Center>
      </Shell>
    );
  }

  return (
    <LiveRoom
      lk={lk}
      call={call}
      creds={creds}
      onActive={() => setPhase('active')}
      onHangup={(forAll) => {
        const id = useCallStore.getState().active?.callId || call.callId;
        if (id) {
          void (call.phase === 'active' || call.kind === 'group'
            ? endCall(id, forAll ? { endForAll: true } : undefined)
            : cancelCall(id)
          ).catch(() => undefined);
        }
        leave();
      }}
      onLost={(message) => {
        useCallStore.setState((s) =>
          s.active ? { active: { ...s.active, phase: 'ended', endedMessage: message } } : s,
        );
      }}
    />
  );
}

function LiveRoom({
  lk,
  call,
  creds,
  onActive,
  onHangup,
  onLost,
}: {
  lk: Lk;
  call: ActiveCall;
  creds: CallTokenResponse;
  onActive: () => void;
  onHangup: (endForAll: boolean) => void;
  onLost: (message: string) => void;
}) {
  const { LiveKitRoom, AudioSession } = lk.rn;
  const isVideo = call.mediaType === 'video';
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    let started = false;
    void AudioSession.startAudioSession()
      .then(() => {
        started = true;
      })
      .catch(() => undefined);
    return () => {
      if (started) void AudioSession.stopAudioSession();
    };
  }, [AudioSession]);

  return (
    <LiveKitRoom
      serverUrl={creds.url}
      token={creds.token}
      connect
      audio
      video={isVideo}
      onConnected={onActive}
      onError={(e) => setMediaError(e.message)}
      onMediaDeviceFailure={() =>
        setMediaError('Нет доступа к камере или микрофону. Разрешите их в настройках телефона.')
      }
    >
      <RoomView lk={lk} call={call} mediaError={mediaError} onHangup={onHangup} onLost={onLost} />
    </LiveKitRoom>
  );
}

function RoomView({
  lk,
  call,
  mediaError,
  onHangup,
  onLost,
}: {
  lk: Lk;
  call: ActiveCall;
  mediaError: string | null;
  onHangup: (endForAll: boolean) => void;
  onLost: (message: string) => void;
}) {
  const { useTracks, useRoomContext, useLocalParticipant, VideoTrack, isTrackReference, AudioSession } = lk.rn;
  const { Track, RoomEvent, DisconnectReason } = lk.client;
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const { width } = useWindowDimensions();
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [leaveMenu, setLeaveMenu] = useState(false);
  const [listH, setListH] = useState(0);
  const [speaker, setSpeaker] = useState(call.mediaType === 'video');
  const onLostRef = useRef(onLost);
  onLostRef.current = onLost;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Причину отключения даёт только событие комнаты.
  useEffect(() => {
    const handler = (reason?: number) => {
      const name = reason != null ? (DisconnectReason as unknown as Record<number, string>)[reason] : null;
      if (name === 'CLIENT_INITIATED') return;
      onLostRef.current(isHardEnd(name) ? disconnectMessage(name) : 'Связь потеряна');
    };
    room.on(RoomEvent.Disconnected, handler);
    return () => {
      room.off(RoomEvent.Disconnected, handler);
    };
  }, [room, RoomEvent, DisconnectReason]);

  useEffect(() => {
    void (async () => {
      try {
        const outs = await AudioSession.getAudioOutputs();
        const wanted = speaker ? outs.find((o) => /speaker/i.test(o)) : outs.find((o) => /earpiece/i.test(o));
        if (wanted) await AudioSession.selectAudioOutput(wanted);
      } catch {
        /* маршрут звука не поддерживается устройством */
      }
    })();
  }, [speaker, AudioSession]);

  const flipCamera = async () => {
    try {
      const pub = localParticipant.getTrackPublication(Track.Source.Camera);
      const track = pub?.track as unknown as { mediaStreamTrack?: { _switchCamera?: () => void } } | undefined;
      track?.mediaStreamTrack?._switchCamera?.();
    } catch {
      /* камера недоступна */
    }
  };

  const cols = gridColumns(tracks.length);
  const rows = Math.max(1, Math.ceil(tracks.length / cols));
  const cell = width / cols;
  const tileH = Math.max(150, listH > 0 ? Math.floor(listH / rows) : cell);
  const isHost = call.kind === 'group' && call.isInitiator;

  const share = async () => {
    if (!call.inviteUrl) return;
    try {
      await Share.share({ message: formatInviteText(call.title, call.inviteUrl), title: call.title });
    } catch {
      /* закрыли меню */
    }
  };

  return (
    <Shell>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {call.title}
          </Text>
          <Text style={styles.sub} accessibilityLiveRegion="polite">
            {elapsedLabel(startedAt, now)} · {tracks.length > 0 ? `участников: ${tracks.length}` : 'ожидание'}
          </Text>
        </View>
        {call.inviteUrl ? (
          <Pressable
            onPress={() => void share()}
            accessibilityRole="button"
            accessibilityLabel="Пригласить"
            style={styles.topBtn}
          >
            <Ionicons name="person-add-outline" size={24} color="#fff" />
          </Pressable>
        ) : null}
      </View>

      {mediaError ? <Text style={styles.warn}>{mediaError}</Text> : null}

      <FlatList
        key={cols}
        data={tracks}
        numColumns={cols}
        keyExtractor={(t) => `${t.participant.identity}-${t.source}`}
        scrollEnabled={tracks.length > 6}
        style={{ flex: 1 }}
        onLayout={(e) => setListH(e.nativeEvent.layout.height)}
        renderItem={({ item }) => {
          const showVideo = isTrackReference(item) && !item.publication.isMuted;
          const name = item.participant.name || item.participant.identity;
          return (
            <View style={[styles.tile, { width: cell, height: tileH }]}>
              {showVideo && isTrackReference(item) ? (
                <VideoTrack trackRef={item} style={StyleSheet.absoluteFill as object} objectFit="cover" mirror={item.participant.isLocal} />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initialsOf(name)}</Text>
                </View>
              )}
              <View style={styles.nameTag}>
                {!item.participant.isMicrophoneEnabled ? <Ionicons name="mic-off" size={14} color="#fff" /> : null}
                <Text style={styles.nameText} numberOfLines={1}>
                  {item.participant.isLocal ? 'Вы' : name}
                </Text>
              </View>
            </View>
          );
        }}
      />

      <View style={styles.controls}>
        <RoundButton
          icon={isMicrophoneEnabled ? 'mic' : 'mic-off'}
          label={isMicrophoneEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
          off={!isMicrophoneEnabled}
          onPress={() => void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        />
        {call.mediaType === 'video' ? (
          <>
            <RoundButton
              icon={isCameraEnabled ? 'videocam' : 'videocam-off'}
              label={isCameraEnabled ? 'Выключить камеру' : 'Включить камеру'}
              off={!isCameraEnabled}
              onPress={() => void localParticipant.setCameraEnabled(!isCameraEnabled)}
            />
            <RoundButton icon="camera-reverse" label="Перевернуть камеру" onPress={() => void flipCamera()} />
          </>
        ) : null}
        <RoundButton
          icon={speaker ? 'volume-high' : 'ear'}
          label={speaker ? 'Звук в динамике' : 'Звук в наушнике'}
          off={!speaker}
          onPress={() => setSpeaker((v) => !v)}
        />
        <RoundButton
          icon="call"
          color="#DC2626"
          label="Выйти из звонка"
          rotate
          onPress={() => (isHost ? setLeaveMenu(true) : onHangup(false))}
        />
      </View>

      <ActionSheet
        visible={leaveMenu}
        title="Завершить звонок"
        onClose={() => setLeaveMenu(false)}
        items={[
          { key: 'leave', label: 'Выйти, встреча продолжится', icon: 'exit-outline', onPress: () => onHangup(false) },
          { key: 'all', label: 'Завершить для всех', icon: 'close-circle-outline', danger: true, onPress: () => onHangup(true) },
        ]}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      {children}
    </SafeAreaView>
  );
}

function Center({
  icon,
  title,
  text,
  pulse,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text?: string;
  pulse?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.center} accessibilityLiveRegion={pulse ? 'none' : 'polite'}>
      <View style={[styles.bigIcon, pulse && { opacity: 0.9 }]}>
        <Ionicons name={icon} size={44} color="#fff" />
      </View>
      <Text style={styles.centerTitle}>{title}</Text>
      {text ? <Text style={styles.centerText}>{text}</Text> : null}
      <View style={{ gap: 12, marginTop: 24, alignItems: 'center', alignSelf: 'stretch' }}>{children}</View>
    </View>
  );
}

function BigButton({ label, onPress, ghost }: { label: string; onPress: () => void; ghost?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.bigBtn, ghost && styles.bigBtnGhost, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.bigBtnText, ghost && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
  color,
  off,
  rotate,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
  off?: boolean;
  rotate?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.round,
        { backgroundColor: color ?? (off ? '#fff' : PANEL) },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Ionicons
        name={icon}
        size={26}
        color={off && !color ? '#111' : '#fff'}
        style={rotate ? { transform: [{ rotate: '135deg' }] } : undefined}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  title: { fontSize: 19, fontWeight: '800', color: '#fff' },
  sub: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 1, fontVariant: ['tabular-nums'] },
  topBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: PANEL, alignItems: 'center', justifyContent: 'center' },
  warn: { fontSize: 14, color: '#FCA5A5', paddingHorizontal: 16, paddingBottom: 6 },
  tile: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#000', backgroundColor: PANEL, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#3F3F46', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 30, fontWeight: '800', color: '#fff' },
  nameTag: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '85%', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.55)' },
  nameText: { fontSize: 13, fontWeight: '700', color: '#fff', flexShrink: 1 },
  controls: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 14, paddingHorizontal: 12, paddingVertical: 14 },
  round: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  bigIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#3F3F46', alignItems: 'center', justifyContent: 'center' },
  centerTitle: { fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'center', marginTop: 20 },
  centerText: { fontSize: 16, lineHeight: 24, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: 8 },
  bigBtn: { minHeight: 54, alignSelf: 'stretch', borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  bigBtnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  bigBtnText: { fontSize: 17, fontWeight: '800', color: '#111' },
});
