import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchPrayerViewersToday, ruVisitorsWord } from '../../api/prayerAdmin';
import { initialsOf } from '../../lib/dashboardHome';
import { useTheme, type ThemeColors } from '../../theme';

/** Для админа и пастора: сколько человек сегодня открывали «Молитву» и кто именно. */
export function PrayerViewersCard({ enabled }: { enabled: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: ['calendar', 'prayer-section', 'today-viewers'],
    queryFn: fetchPrayerViewersToday,
    staleTime: 45_000,
    enabled,
  });

  if (!enabled) return null;
  const count = query.data?.unique_viewers_today ?? 0;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Кто сегодня открывал раздел Молитва"
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      >
        <View style={styles.icon}>
          <Ionicons name="eye-outline" size={22} color={colors.primary} />
        </View>
        <View style={styles.meta}>
          {query.isPending ? (
            <Text style={styles.text}>Считаем посещения…</Text>
          ) : query.isError ? (
            <Text style={styles.text}>Не удалось загрузить посещения</Text>
          ) : (
            <>
              <Text style={styles.text}>
                Сегодня раздел открыли <Text style={styles.count}>{count}</Text>{' '}
                {ruVisitorsWord(count)}
              </Text>
              <Text style={styles.link}>Посмотреть список</Text>
            </>
          )}
        </View>
        <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Кто открывал раздел сегодня</Text>
            <Pressable
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Закрыть"
              style={styles.close}
            >
              <Text style={styles.closeText}>Закрыть</Text>
            </Pressable>
          </View>
          <FlatList
            data={query.data?.viewers ?? []}
            keyExtractor={(v) => String(v.member_id)}
            contentContainerStyle={{ padding: 16, gap: 8 }}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {query.isPending ? 'Загрузка…' : 'Сегодня раздел ещё никто не открывал.'}
              </Text>
            }
            renderItem={({ item }) => {
              const seen = item.first_seen_at ? new Date(item.first_seen_at) : null;
              const time = seen && !Number.isNaN(seen.getTime()) ? format(seen, 'HH:mm') : null;
              return (
                <View style={styles.row}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initialsOf(item.name)}</Text>
                  </View>
                  <Text style={styles.name} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {time ? <Text style={styles.time}>{time}</Text> : null}
                </View>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: colors.radius,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.textMuted + '44',
    },
    icon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.primary + '17',
      alignItems: 'center',
      justifyContent: 'center',
    },
    meta: { flex: 1, minWidth: 0 },
    text: { fontSize: 16, fontWeight: '600', color: colors.textSecondary, lineHeight: 22 },
    count: { fontWeight: '800', color: colors.text },
    link: { fontSize: 14, fontWeight: '700', color: colors.primary, marginTop: 2 },
    safe: { flex: 1, backgroundColor: colors.surface },
    modalHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 12,
    },
    modalTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: colors.text },
    close: { minHeight: 48, justifyContent: 'center' },
    closeText: { fontSize: 16, fontWeight: '700', color: colors.primary },
    empty: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', paddingTop: 32 },
    row: {
      minHeight: 60,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 14,
      backgroundColor: colors.surfaceElevated,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary + '1F',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { fontSize: 14, fontWeight: '800', color: colors.primary },
    name: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.text },
    time: { fontSize: 15, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  });
}
