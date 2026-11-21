import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { BroadcastData } from '../../api/dashboard';
import {
  broadcastPlatformLabel,
  formatBroadcastTimer,
  getBroadcastUiMode,
} from '../../lib/dashboardHome';
import { useTheme, type ThemeColors } from '../../theme';

const LIVE = '#DC2626';

export function BroadcastCard({ broadcast }: { broadcast: BroadcastData }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const mode = getBroadcastUiMode(nowMs, broadcast);
  const onAir = mode === 'onair';
  const url = broadcast.stream_url?.trim() || null;

  return (
    <View style={styles.card} accessibilityLabel="Прямой эфир">
      <View style={styles.head}>
        <View style={[styles.dot, { backgroundColor: onAir ? LIVE : colors.textMuted }]} />
        <Text style={[styles.status, onAir && { color: LIVE }]}>
          {onAir ? 'В ЭФИРЕ' : 'СКОРО ЭФИР'}
        </Text>
        <Text style={styles.timer} accessibilityLabel="Таймер эфира">
          {formatBroadcastTimer(nowMs, broadcast)}
        </Text>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {broadcast.title ?? 'Трансляция богослужения'}
      </Text>
      <Text style={styles.sub}>{broadcastPlatformLabel(broadcast.platform)}</Text>
      {url ? (
        <Pressable
          onPress={() => void Linking.openURL(url)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="play" size={18} color="#fff" />
          <Text style={styles.btnText}>Смотреть эфир</Text>
        </Pressable>
      ) : (
        <Text style={styles.hint}>Ссылка на трансляцию появится перед началом.</Text>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius + 4,
      padding: 16,
      borderWidth: 1,
      borderColor: LIVE + '33',
      gap: 4,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    status: { flex: 1, fontSize: 12, fontWeight: '800', letterSpacing: 1, color: colors.textMuted },
    timer: { fontSize: 15, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
    title: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 6 },
    sub: { fontSize: 13, color: colors.textMuted },
    hint: { fontSize: 13, color: colors.textSecondary, marginTop: 8 },
    btn: {
      marginTop: 10,
      minHeight: 48,
      borderRadius: 14,
      backgroundColor: LIVE,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    btnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  });
}
