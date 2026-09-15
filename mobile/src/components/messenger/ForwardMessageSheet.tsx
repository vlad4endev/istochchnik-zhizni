import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ConversationListItem } from '../../api/messenger';
import { getConversationAvatarUrl, getConversationTitle } from '../../lib/messengerUtils';
import { useTheme, type ThemeColors } from '../../theme';
import { ChatAvatar } from './ChatAvatar';

interface ForwardMessageSheetProps {
  visible: boolean;
  messageId: string | null;
  conversations: ConversationListItem[];
  sourceConversationId?: string;
  onClose: () => void;
  onForward: (conversationIds: string[]) => Promise<void>;
}

export function ForwardMessageSheet({
  visible,
  messageId,
  conversations,
  sourceConversationId,
  onClose,
  onForward,
}: ForwardMessageSheetProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations
      .filter((c) => /^\d+$/.test(String(c.id)))
      .filter((c) => String(c.id) !== String(sourceConversationId ?? ''))
      .filter((c) => {
        if (!q) return true;
        return getConversationTitle(c).toLowerCase().includes(q);
      })
      .slice(0, 80);
  }, [conversations, query, sourceConversationId]);

  const reset = () => {
    setQuery('');
    setSelected(new Set());
    setError(null);
  };

  const handleClose = () => {
    if (sending) return;
    reset();
    onClose();
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleForward = async () => {
    if (!messageId || selected.size === 0 || sending) return;
    setSending(true);
    setError(null);
    try {
      await onForward([...selected]);
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось переслать');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[styles.safe, { paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Переслать</Text>
            <Text style={styles.subtitle}>
              {selected.size > 0 ? `Выбрано: ${selected.size}` : 'Выберите чаты'}
            </Text>
          </View>
          <Pressable onPress={handleClose} hitSlop={12} disabled={sending}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Поиск…"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />
        </View>

        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>Нет доступных чатов</Text>}
          renderItem={({ item }) => {
            const title = getConversationTitle(item);
            const avatar = getConversationAvatarUrl(item);
            const isSelected = selected.has(item.id);
            return (
              <Pressable
                onPress={() => toggle(item.id)}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
              >
                <ChatAvatar name={title} imageUrl={avatar} seed={item.id} size={40} />
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {title}
                </Text>
                <View style={[styles.check, isSelected && styles.checkOn]}>
                  {isSelected ? (
                    <Ionicons name="checkmark" size={16} color={colors.textOnPrimary} />
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={() => void handleForward()}
          disabled={sending || selected.size === 0}
          style={({ pressed }) => [
            styles.submit,
            (sending || selected.size === 0) && { opacity: 0.5 },
            pressed && selected.size > 0 && { opacity: 0.9 },
          ]}
        >
          {sending ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.submitText}>Переслать</Text>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(28,25,23,0.08)',
    },
    headerText: { flex: 1, minWidth: 0 },
    title: { fontSize: 18, fontWeight: '800', color: colors.text },
    subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      margin: 16,
      marginBottom: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.1)',
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      padding: 0,
    },
    list: { paddingHorizontal: 8, paddingBottom: 16 },
    empty: {
      textAlign: 'center',
      color: colors.textMuted,
      marginTop: 32,
      fontSize: 14,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
    },
    rowTitle: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    check: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(28,25,23,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkOn: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    error: {
      color: '#dc2626',
      fontWeight: '600',
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    submit: {
      marginHorizontal: 16,
      marginBottom: 12,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    submitText: {
      color: colors.textOnPrimary,
      fontWeight: '800',
      fontSize: 16,
    },
  });
}
