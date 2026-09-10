import { Ionicons } from '@expo/vector-icons';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { resolveApiOrigin } from '../../lib/config';
import { getAuthToken } from '../../lib/storage';
import { MessengerText } from './MessengerText';
import { useTheme } from '../../theme';

interface VoiceNotePlayerProps {
  messageId: string;
  localUri?: string | null;
  durationSec?: number | null;
  isOwn: boolean;
  isPending?: boolean;
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function VoiceNotePlayer({
  messageId,
  localUri,
  durationSec,
  isOwn,
  isPending = false,
}: VoiceNotePlayerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, isOwn), [colors, isOwn]);

  const source = useMemo(() => {
    if (localUri) return localUri;
    if (!/^\d+$/.test(String(messageId))) return null;
    const token = getAuthToken();
    const path = `/api/messenger/messages/${encodeURIComponent(messageId)}/attachment-file`;
    return {
      uri: `${resolveApiOrigin()}${path}`,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    };
  }, [localUri, messageId]);

  const player = useAudioPlayer(source, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      interruptionMode: 'duckOthers',
    });
  }, []);

  const duration =
    status.duration > 0
      ? status.duration
      : typeof durationSec === 'number' && durationSec > 0
        ? durationSec
        : 0;
  const current = status.currentTime > 0 ? status.currentTime : 0;
  const progress = duration > 0 ? Math.min(1, current / duration) : 0;

  const toggle = () => {
    if (isPending || !source) return;
    if (status.playing) {
      player.pause();
    } else {
      if (status.didJustFinish || (duration > 0 && current >= duration - 0.15)) {
        void player.seekTo(0);
      }
      player.play();
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={toggle}
        disabled={isPending || !source}
        style={({ pressed }) => [styles.playBtn, pressed && { opacity: 0.85 }]}
      >
        {isPending ? (
          <ActivityIndicator size="small" color={isOwn ? colors.textOnPrimary : colors.primary} />
        ) : (
          <Ionicons
            name={status.playing ? 'pause' : 'play'}
            size={18}
            color={isOwn ? colors.textOnPrimary : colors.primary}
          />
        )}
      </Pressable>
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${Math.round(progress * 100)}%` as `${number}%` }]} />
      </View>
      <MessengerText bidiSafe={false} style={styles.time}>
        {formatDuration(status.playing || current > 0 ? current : duration)}
      </MessengerText>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isOwn: boolean) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minWidth: 180,
      paddingVertical: 4,
    },
    playBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isOwn ? 'rgba(255,255,255,0.2)' : 'rgba(139,26,26,0.12)',
    },
    track: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: isOwn ? 'rgba(255,255,255,0.25)' : 'rgba(28,25,23,0.12)',
      overflow: 'hidden',
    },
    trackFill: {
      height: '100%',
      backgroundColor: isOwn ? 'rgba(255,255,255,0.85)' : colors.primary,
    },
    time: {
      fontSize: 12,
      fontWeight: '600',
      color: isOwn ? 'rgba(255,255,255,0.85)' : colors.textMuted,
      minWidth: 36,
      textAlign: 'right',
    },
  });
}
