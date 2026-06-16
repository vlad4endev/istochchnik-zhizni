import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSermonPlayer } from '../contexts/SermonPlayerContext';
import { episodeSubtitle, formatDuration } from '../lib/sermonFormat';
import { useSermonsStore } from '../stores/sermonsStore';
import { useTheme } from '../theme';

const TAB_BAR_OFFSET = 72;

export function SermonPlayerBar() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  const {
    activeEpisode,
    playing,
    currentTime,
    duration,
    togglePlayPause,
    closePlayer,
    seekTo,
  } = useSermonPlayer();
  const toggleFavorite = useSermonsStore((s) => s.toggleFavorite);
  const isFav = useSermonsStore((s) =>
    activeEpisode ? Boolean(s.favorites[activeEpisode.id]) : false,
  );

  if (!activeEpisode) return null;

  const dur = duration > 0 ? duration : (activeEpisode.duration ?? 0);
  const ratio = dur > 0 ? Math.max(0, Math.min(1, currentTime / dur)) : 0;
  const progressLabel = `${formatDuration(currentTime) ?? '0:00'} / ${formatDuration(dur) ?? '—'}`;

  const onSeekBack = () => {
    void seekTo(Math.max(0, currentTime - 15));
  };

  const onSeekForward = () => {
    if (dur > 0) void seekTo(Math.min(dur, currentTime + 30));
  };

  return (
    <View
      style={[
        styles.wrap,
        { bottom: TAB_BAR_OFFSET + Math.max(insets.bottom, 8) },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.art}>
          {activeEpisode.imageUrl ? (
            <Image source={{ uri: activeEpisode.imageUrl }} style={styles.artImg} />
          ) : (
            <View style={styles.artPlaceholder}>
              <Ionicons name="headset-outline" size={22} color={colors.textMuted} />
            </View>
          )}
        </View>
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={1}>
            {activeEpisode.title}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {episodeSubtitle(activeEpisode) || progressLabel}
          </Text>
        </View>
        <Pressable
          onPress={() => toggleFavorite(activeEpisode.id)}
          style={styles.iconBtn}
          accessibilityLabel="Избранное"
        >
          <Ionicons
            name={isFav ? 'heart' : 'heart-outline'}
            size={22}
            color={isFav ? '#e11d48' : colors.textSecondary}
          />
        </Pressable>
        <Pressable onPress={closePlayer} style={styles.iconBtn} accessibilityLabel="Закрыть">
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>
      <Text style={styles.time}>{progressLabel}</Text>

      <View style={styles.controls}>
        <Pressable onPress={onSeekBack} style={styles.controlBtn}>
          <Ionicons name="play-back" size={22} color={colors.text} />
          <Text style={styles.controlHint}>15с</Text>
        </Pressable>
        <Pressable onPress={togglePlayPause} style={styles.playBtn}>
          <Ionicons
            name={playing ? 'pause' : 'play'}
            size={28}
            color={colors.textOnPrimary}
          />
        </Pressable>
        <Pressable onPress={onSeekForward} style={styles.controlBtn}>
          <Ionicons name="play-forward" size={22} color={colors.text} />
          <Text style={styles.controlHint}>30с</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 12,
      right: 12,
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(41,37,36,0.96)' : 'rgba(255,255,255,0.96)',
      padding: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.18,
      shadowRadius: 24,
      elevation: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(28,25,23,0.08)',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    art: {
      width: 48,
      height: 48,
      borderRadius: 12,
      overflow: 'hidden',
    },
    artImg: {
      width: '100%',
      height: '100%',
    },
    artPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    meta: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text,
    },
    sub: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
      fontWeight: '600',
    },
    iconBtn: {
      padding: 6,
    },
    progressTrack: {
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,25,23,0.08)',
      marginTop: 12,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: 2,
    },
    time: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 6,
      textAlign: 'center',
      fontWeight: '600',
    },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
      marginTop: 10,
    },
    controlBtn: {
      alignItems: 'center',
      padding: 8,
    },
    controlHint: {
      fontSize: 10,
      color: colors.textMuted,
      fontWeight: '700',
    },
    playBtn: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
