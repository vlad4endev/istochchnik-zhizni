import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  createGroupChat,
  createPersonalChat,
  searchMembers,
  type SearchMember,
} from '../api/messenger';
import { ChatAvatar } from '../components/messenger/ChatAvatar';
import { ErrorView } from '../components/ErrorView';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../stores/authStore';
import { useTheme } from '../theme';

type Mode = 'contact' | 'group';
type GroupStep = 'members' | 'details';

function memberDisplayName(m: SearchMember): string {
  const fn = (m.first_name || '').trim();
  const ln = (m.last_name || '').trim();
  const full = `${fn} ${ln}`.trim();
  return full || m.name;
}

export function NewChatScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const currentMemberId = useAuthStore((s) => s.memberId);

  const [mode, setMode] = useState<Mode>('contact');
  const [groupStep, setGroupStep] = useState<GroupStep>('members');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Record<number, SearchMember>>({});
  const [groupTitle, setGroupTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({
      title: mode === 'group' ? 'Новая группа' : 'Новый чат',
    });
  }, [navigation, mode]);

  const searchQuery = useQuery({
    queryKey: ['messenger', 'member-search', query],
    queryFn: () => searchMembers(query.trim()),
    enabled: query.trim().length >= 2,
  });

  const members = useMemo(() => {
    const list = searchQuery.data ?? [];
    return list.filter((m) => {
      if (m.registration_status && m.registration_status !== 'active') return false;
      if (currentMemberId != null && m.id === currentMemberId) return false;
      return true;
    });
  }, [searchQuery.data, currentMemberId]);

  const selectedList = useMemo(() => Object.values(selected), [selected]);
  const selectedCount = selectedList.length;

  const personalMutation = useMutation({
    mutationFn: (memberId: number) => createPersonalChat(memberId),
    onSuccess: async (data, memberId) => {
      await queryClient.invalidateQueries({ queryKey: ['messenger', 'conversations'] });
      const member = searchQuery.data?.find((m) => m.id === memberId);
      const title = member ? memberDisplayName(member) : 'Чат';
      navigation.replace('ChatThread', {
        conversationId: data.conversationId,
        title,
        isGroup: false,
      });
    },
  });

  const groupMutation = useMutation({
    mutationFn: () =>
      createGroupChat(
        groupTitle.trim(),
        'group',
        selectedList.map((m) => m.id),
      ),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['messenger', 'conversations'] });
      navigation.replace('ChatThread', {
        conversationId: data.conversationId,
        title: groupTitle.trim(),
        isGroup: true,
      });
    },
  });

  const switchMode = (next: Mode) => {
    setMode(next);
    setQuery('');
    setSelected({});
    setGroupTitle('');
    setTitleError(null);
    setGroupStep('members');
  };

  const toggleMember = (m: SearchMember) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[m.id]) delete next[m.id];
      else next[m.id] = m;
      return next;
    });
  };

  const goDetails = () => {
    if (selectedCount === 0) {
      setTitleError('Выберите хотя бы одного участника');
      return;
    }
    setTitleError(null);
    setGroupStep('details');
  };

  const createGroup = () => {
    const trimmed = groupTitle.trim();
    if (!trimmed) {
      setTitleError('Введите название группы');
      return;
    }
    if (selectedCount === 0) {
      setTitleError('Выберите хотя бы одного участника');
      return;
    }
    setTitleError(null);
    groupMutation.mutate();
  };

  const pending =
    personalMutation.isPending || groupMutation.isPending;
  const mutationError =
    personalMutation.error ?? groupMutation.error;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.tabs}>
        <Pressable
          onPress={() => switchMode('contact')}
          style={[styles.tab, mode === 'contact' && styles.tabActive]}
        >
          <Text style={[styles.tabText, mode === 'contact' && styles.tabTextActive]}>
            Личный
          </Text>
        </Pressable>
        <Pressable
          onPress={() => switchMode('group')}
          style={[styles.tab, mode === 'group' && styles.tabActive]}
        >
          <Text style={[styles.tabText, mode === 'group' && styles.tabTextActive]}>
            Группа
          </Text>
        </Pressable>
      </View>

      {mode === 'group' && groupStep === 'details' ? (
        <View style={styles.details}>
          <Text style={styles.detailsLabel}>Название группы</Text>
          <TextInput
            style={styles.search}
            value={groupTitle}
            onChangeText={(v) => {
              setGroupTitle(v);
              if (titleError) setTitleError(null);
            }}
            placeholder="Например: Служение медиа"
            placeholderTextColor={colors.textMuted}
            autoFocus
            maxLength={120}
          />
          <Text style={styles.pickedHint}>
            Участников: {selectedCount}
          </Text>
          {titleError ? <Text style={styles.inlineError}>{titleError}</Text> : null}
          <View style={styles.wizardActions}>
            <Pressable
              onPress={() => setGroupStep('members')}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
              disabled={pending}
            >
              <Text style={styles.secondaryBtnText}>Назад</Text>
            </Pressable>
            <Pressable
              onPress={createGroup}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
              disabled={pending}
            >
              {groupMutation.isPending ? (
                <ActivityIndicator color={colors.textOnPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>Создать</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          {mode === 'group' && selectedCount > 0 ? (
            <View style={styles.chips}>
              {selectedList.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => toggleMember(m)}
                  style={styles.chip}
                >
                  <Text style={styles.chipText} numberOfLines={1}>
                    {memberDisplayName(m)}
                  </Text>
                  <Ionicons name="close" size={14} color={colors.textSecondary} />
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.searchWrap}>
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Имя или фамилия..."
              placeholderTextColor={colors.textMuted}
              autoFocus={mode === 'contact'}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>

          {mode === 'group' ? (
            <View style={styles.groupBar}>
              <Text style={styles.pickedHint}>
                {selectedCount === 0
                  ? 'Выберите участников'
                  : `Выбрано: ${selectedCount}`}
              </Text>
              <Pressable
                onPress={goDetails}
                disabled={selectedCount === 0}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  styles.nextBtn,
                  selectedCount === 0 && styles.btnDisabled,
                  pressed && selectedCount > 0 && styles.pressed,
                ]}
              >
                <Text style={styles.primaryBtnText}>Далее</Text>
              </Pressable>
            </View>
          ) : null}

          {titleError && mode === 'group' ? (
            <Text style={[styles.inlineError, { paddingHorizontal: 16 }]}>{titleError}</Text>
          ) : null}

          {query.trim().length < 2 ? (
            <View style={styles.hint}>
              <Text style={styles.hintText}>Введите минимум 2 символа для поиска</Text>
            </View>
          ) : null}

          {searchQuery.isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}

          {searchQuery.isError ? (
            <ErrorView
              message={
                searchQuery.error instanceof Error
                  ? searchQuery.error.message
                  : 'Ошибка'
              }
              onRetry={() => void searchQuery.refetch()}
            />
          ) : null}

          {query.trim().length >= 2 && !searchQuery.isLoading && !searchQuery.isError ? (
            <FlatList
              data={members}
              keyExtractor={(item) => String(item.id)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.hint}>
                  <Text style={styles.hintText}>Никого не найдено</Text>
                </View>
              }
              renderItem={({ item }) => {
                const name = memberDisplayName(item);
                if (mode === 'contact') {
                  const busy =
                    personalMutation.isPending && personalMutation.variables === item.id;
                  return (
                    <Pressable
                      onPress={() => personalMutation.mutate(item.id)}
                      disabled={pending}
                      style={({ pressed }) => [
                        styles.row,
                        pressed && { backgroundColor: `${colors.primary}10` },
                      ]}
                    >
                      <ChatAvatar
                        name={name}
                        imageUrl={item.avatar_url}
                        seed={String(item.id)}
                        size={48}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name}>{name}</Text>
                        {item.is_online ? (
                          <Text style={styles.online}>в сети</Text>
                        ) : null}
                      </View>
                      {busy ? <ActivityIndicator color={colors.primary} /> : null}
                    </Pressable>
                  );
                }

                const picked = Boolean(selected[item.id]);
                return (
                  <Pressable
                    onPress={() => toggleMember(item)}
                    style={({ pressed }) => [
                      styles.row,
                      pressed && { backgroundColor: `${colors.primary}10` },
                    ]}
                  >
                    <ChatAvatar
                      name={name}
                      imageUrl={item.avatar_url}
                      seed={String(item.id)}
                      size={48}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{name}</Text>
                      {item.is_online ? (
                        <Text style={styles.online}>в сети</Text>
                      ) : null}
                    </View>
                    <Ionicons
                      name={picked ? 'checkbox' : 'square-outline'}
                      size={24}
                      color={picked ? colors.primary : colors.textMuted}
                    />
                  </Pressable>
                );
              }}
            />
          ) : null}
        </>
      )}

      {mutationError ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>
            {mutationError instanceof Error
              ? mutationError.message
              : 'Не удалось создать чат'}
          </Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function createStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  isDark: boolean,
) {
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(28,25,23,0.08)';
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    tabs: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginTop: 8,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      padding: 4,
      gap: 4,
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: 'center',
    },
    tabActive: {
      backgroundColor: colors.primary,
    },
    tabText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    tabTextActive: {
      color: colors.textOnPrimary,
    },
    searchWrap: {
      padding: 16,
      paddingBottom: 8,
    },
    search: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      maxWidth: 160,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: border,
    },
    chipText: {
      fontSize: 13,
      color: colors.text,
      fontWeight: '500',
      maxWidth: 120,
    },
    groupBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 8,
      gap: 12,
    },
    pickedHint: {
      flex: 1,
      fontSize: 13,
      color: colors.textMuted,
    },
    nextBtn: {
      paddingHorizontal: 18,
      minWidth: 88,
    },
    details: {
      padding: 16,
      gap: 12,
    },
    detailsLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    wizardActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 8,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    primaryBtnText: {
      color: colors.textOnPrimary,
      fontWeight: '700',
      fontSize: 15,
    },
    secondaryBtn: {
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceElevated,
    },
    secondaryBtnText: {
      color: colors.textSecondary,
      fontWeight: '600',
      fontSize: 15,
    },
    btnDisabled: {
      opacity: 0.4,
    },
    pressed: {
      opacity: 0.75,
    },
    inlineError: {
      color: '#b91c1c',
      fontSize: 13,
    },
    hint: {
      padding: 24,
      alignItems: 'center',
    },
    hintText: {
      color: colors.textMuted,
      fontSize: 14,
      textAlign: 'center',
    },
    center: {
      padding: 24,
      alignItems: 'center',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    name: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    online: {
      fontSize: 12,
      color: '#22c55e',
      marginTop: 2,
    },
    errorBar: {
      padding: 12,
      backgroundColor: '#fef2f2',
    },
    errorText: {
      color: '#b91c1c',
      textAlign: 'center',
      fontSize: 14,
    },
  });
}
