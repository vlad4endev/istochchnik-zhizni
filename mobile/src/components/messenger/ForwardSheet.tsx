import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatApiError } from '../../api/client';
import { fetchConversations, forwardMessage, type ConversationListItem } from '../../api/messenger';
import { getConversationAvatarUrl, getConversationTitle } from '../../lib/messengerUtils';
import { useTheme, type ThemeColors } from '../../theme';
import { ChatAvatar } from './ChatAvatar';

type Props = {
  /** Пересылаемое сообщение; null — окно закрыто. */
  messageId: string | null;
  /** Чат-источник исключается из списка, как на вебе. */
  sourceConversationId: string;
  onClose: () => void;
  onForwarded: (chatCount: number) => void;
};

/** Выбор чатов для пересылки: поиск, несколько получателей, кнопка «Переслать (N)». */
export function ForwardSheet({ messageId, sourceConversationId, onClose, onForwarded }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const conversations = useQuery({
    queryKey: ['messenger', 'conversations'],
    queryFn: fetchConversations,
    staleTime: 30_000,
    enabled: messageId != null,
  });

  useEffect(() => {
    if (messageId == null) {
      setQuery('');
      setSelected(new Set());
    }
  }, [messageId]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (conversations.data ?? [])
      .filter((c) => c.id !== sourceConversationId && /^\d+$/.test(String(c.id)))
      .filter((c) => !q || getConversationTitle(c).toLowerCase().includes(q))
      .sort((a, b) => Number(Boolean(b.my_ui_pinned)) - Number(Boolean(a.my_ui_pinned)));
  }, [conversations.data, query, sourceConversationId]);

  const forwardMut = useMutation({
    mutationFn: () => forwardMessage(messageId!, [...selected]),
    onSuccess: (count) => {
      void qc.invalidateQueries({ queryKey: ['messenger', 'conversations'] });
      onForwarded(count);
      onClose();
    },
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderItem = ({ item }: { item: ConversationListItem }) => {
    const title = getConversationTitle(item);
    const on = selected.has(item.id);
    return (
      <Pressable
        onPress={() => toggle(item.id)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        accessibilityLabel={title}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.primary + '10' }]}
      >
        <ChatAvatar
          name={title}
          imageUrl={getConversationAvatarUrl(item)}
          seed={item.id}
          size={46}
          showOnline={false}
          isOnline={false}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.sub}>{item.type === 'private' ? 'Личный чат' : item.type === 'channel' ? 'Канал' : 'Группа'}</Text>
        </View>
        <View style={[styles.check, on && styles.checkOn]}>
          {on ? <Ionicons name="checkmark" size={18} color={colors.textOnPrimary} /> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <Modal visible={messageId != null} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Переслать</Text>
            <Text style={styles.sub}>
              {selected.size > 0 ? `Выбрано: ${selected.size}` : 'Выберите чаты'}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            disabled={forwardMut.isPending}
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            style={styles.close}
          >
            <Text style={styles.closeText}>Закрыть</Text>
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Поиск чатов"
            placeholderTextColor={colors.textMuted}
            style={styles.search}
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="Поиск чатов"
          />
        </View>

        {conversations.isPending ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : conversations.isError ? (
          <Text style={styles.empty}>Не удалось загрузить чаты: {formatApiError(conversations.error)}</Text>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(c) => c.id}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={styles.empty}>
                {query.trim() ? 'Ничего не найдено' : 'Нет других чатов, куда можно переслать.'}
              </Text>
            }
          />
        )}

        {forwardMut.isError ? (
          <Text style={styles.error}>Не удалось переслать: {formatApiError(forwardMut.error)}</Text>
        ) : null}

        <View style={styles.footer}>
          <Pressable
            onPress={() => forwardMut.mutate()}
            disabled={selected.size === 0 || forwardMut.isPending}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.sendBtn,
              (selected.size === 0 || forwardMut.isPending) && { opacity: 0.5 },
              pressed && { opacity: 0.85 },
            ]}
          >
            {forwardMut.isPending ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <>
                <Ionicons name="arrow-redo" size={20} color={colors.textOnPrimary} />
                <Text style={styles.sendText}>
                  {selected.size > 0 ? `Переслать (${selected.size})` : 'Переслать'}
                </Text>
              </>
            )}
          </Pressable>
        </View>
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
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 8,
      paddingHorizontal: 12,
      minHeight: 46,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
    },
    search: { flex: 1, fontSize: 17, color: colors.text, paddingVertical: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 64 },
    name: { fontSize: 17, fontWeight: '700', color: colors.text },
    check: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: colors.textMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    empty: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', padding: 32, lineHeight: 24 },
    error: { fontSize: 15, color: '#B42318', paddingHorizontal: 16, paddingVertical: 6 },
    footer: { padding: 12 },
    sendBtn: {
      minHeight: 54,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      borderRadius: 16,
      backgroundColor: colors.primary,
    },
    sendText: { fontSize: 17, fontWeight: '800', color: colors.textOnPrimary },
  });
}
