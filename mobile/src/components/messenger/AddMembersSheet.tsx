import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { searchMembers, type SearchMember } from '../../api/messenger';
import { useTheme, type ThemeColors } from '../../theme';
import { ChatAvatar } from './ChatAvatar';

function memberDisplayName(m: SearchMember): string {
  const fn = (m.first_name || '').trim();
  const ln = (m.last_name || '').trim();
  const full = `${fn} ${ln}`.trim();
  return full || m.name;
}

interface AddMembersSheetProps {
  visible: boolean;
  existingMemberIds: number[];
  currentMemberId: number | null;
  onClose: () => void;
  onAdd: (memberId: number) => Promise<void>;
}

export function AddMembersSheet({
  visible,
  existingMemberIds,
  currentMemberId,
  onClose,
  onAdd,
}: AddMembersSheetProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const existing = useMemo(() => new Set(existingMemberIds), [existingMemberIds]);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setBusyId(null);
      setError(null);
    }
  }, [visible]);

  const searchQuery = useQuery({
    queryKey: ['messenger', 'member-search', 'add', query],
    queryFn: () => searchMembers(query.trim()),
    enabled: visible && query.trim().length >= 2,
  });

  const members = useMemo(() => {
    const list = searchQuery.data ?? [];
    return list.filter((m) => {
      if (currentMemberId != null && m.id === currentMemberId) return false;
      if (m.registration_status && m.registration_status !== 'active') return false;
      return true;
    });
  }, [searchQuery.data, currentMemberId]);

  const handleClose = () => {
    if (busyId != null) return;
    onClose();
  };

  const handleAdd = async (m: SearchMember) => {
    if (existing.has(m.id) || busyId != null) return;
    setBusyId(m.id);
    setError(null);
    try {
      await onAdd(m.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось добавить участника');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={handleClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Добавить участников</Text>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Имя или фамилия..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
            autoCorrect={false}
          />

          {query.trim().length < 2 ? (
            <Text style={styles.hint}>Введите минимум 2 символа</Text>
          ) : null}

          {searchQuery.isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}

          {query.trim().length >= 2 && !searchQuery.isLoading ? (
            <FlatList
              data={members}
              keyExtractor={(item) => String(item.id)}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              ListEmptyComponent={
                <Text style={styles.hint}>Никого не найдено</Text>
              }
              renderItem={({ item }) => {
                const name = memberDisplayName(item);
                const inChat = existing.has(item.id);
                const busy = busyId === item.id;
                return (
                  <Pressable
                    onPress={() => void handleAdd(item)}
                    disabled={inChat || busyId != null}
                    style={({ pressed }) => [
                      styles.row,
                      pressed && !inChat && styles.rowPressed,
                      inChat && styles.rowDisabled,
                    ]}
                  >
                    <ChatAvatar
                      name={name}
                      imageUrl={item.avatar_url}
                      seed={String(item.id)}
                      size={44}
                    />
                    <View style={styles.rowText}>
                      <Text style={styles.name} numberOfLines={1}>
                        {name}
                      </Text>
                      {inChat ? (
                        <Text style={styles.meta}>Уже в чате</Text>
                      ) : item.is_online ? (
                        <Text style={styles.online}>в сети</Text>
                      ) : null}
                    </View>
                    {busy ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : inChat ? (
                      <Text style={styles.badge}>В чате</Text>
                    ) : (
                      <Ionicons name="person-add-outline" size={22} color={colors.primary} />
                    )}
                  </Pressable>
                );
              }}
            />
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={handleClose}
            disabled={busyId != null}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.rowPressed]}
          >
            <Text style={styles.closeBtnText}>Закрыть</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(28,25,23,0.08)';
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    dismiss: {
      flex: 1,
    },
    sheet: {
      backgroundColor: colors.surfaceElevated,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 10,
      maxHeight: '85%',
      gap: 10,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.textMuted,
      opacity: 0.5,
      marginBottom: 4,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    search: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 16,
      color: colors.text,
    },
    list: {
      maxHeight: 360,
    },
    hint: {
      textAlign: 'center',
      color: colors.textMuted,
      fontSize: 14,
      paddingVertical: 16,
    },
    center: {
      paddingVertical: 24,
      alignItems: 'center',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: border,
    },
    rowPressed: {
      opacity: 0.7,
    },
    rowDisabled: {
      opacity: 0.55,
    },
    rowText: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    meta: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    online: {
      fontSize: 12,
      color: '#22c55e',
      marginTop: 2,
    },
    badge: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
    },
    error: {
      color: '#b91c1c',
      textAlign: 'center',
      fontSize: 13,
    },
    closeBtn: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    closeBtnText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textSecondary,
    },
  });
}
