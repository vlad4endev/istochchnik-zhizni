import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatApiError } from '../../api/client';
import { fetchMessageReaders } from '../../api/messenger';
import { readersSubtitle } from '../../lib/readReceipts';
import { useTheme, type ThemeColors } from '../../theme';
import { ChatAvatar } from './ChatAvatar';

function formatReadTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${time}`;
}

type Props = { messageId: string | null; onClose: () => void };

/** «Прочитали»: кто и когда прочитал сообщение (для автора, в группах и каналах). */
export function ReadersSheet({ messageId, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const readers = useQuery({
    queryKey: ['messenger', 'readers', messageId],
    queryFn: () => fetchMessageReaders(messageId!),
    enabled: messageId != null,
    staleTime: 0,
  });

  const list = readers.data?.readers ?? [];

  return (
    <Modal visible={messageId != null} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.head}>
          <Ionicons name="checkmark-done" size={26} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Прочитали</Text>
            <Text style={styles.sub}>
              {readers.isPending
                ? 'Загрузка…'
                : readersSubtitle(list.length, readers.data?.other_member_count ?? 0)}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            style={styles.close}
          >
            <Text style={styles.closeText}>Закрыть</Text>
          </Pressable>
        </View>

        {readers.isPending ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : readers.isError ? (
          <Text style={styles.empty}>{formatApiError(readers.error)}</Text>
        ) : (
          <FlatList
            data={list}
            keyExtractor={(r) => String(r.member_id)}
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={
              <Text style={styles.empty}>Пока никто не прочитал это сообщение.</Text>
            }
            renderItem={({ item }) => {
              const when = formatReadTime(item.read_at);
              return (
                <View style={styles.row}>
                  <ChatAvatar
                    name={item.display_name}
                    imageUrl={item.avatar_url}
                    seed={String(item.member_id)}
                    size={46}
                    showOnline={false}
                    isOnline={false}
                  />
                  <Text style={styles.name} numberOfLines={2}>
                    {item.display_name}
                  </Text>
                  {when ? <Text style={styles.time}>{when}</Text> : null}
                </View>
              );
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
    title: { fontSize: 20, fontWeight: '800', color: colors.text },
    sub: { fontSize: 14, color: colors.textSecondary, marginTop: 1 },
    close: { minHeight: 48, justifyContent: 'center' },
    closeText: { fontSize: 16, fontWeight: '700', color: colors.primary },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 64 },
    name: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.text },
    time: { fontSize: 14, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
    empty: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', padding: 32, lineHeight: 24 },
  });
}
