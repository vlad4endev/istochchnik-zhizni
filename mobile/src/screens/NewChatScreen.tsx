import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { useTheme } from '../theme';

const GROUP_TITLE_MAX = 128;
const MEMBER_LIMIT = 200;

type WizardStep = 'contact' | 'members' | 'details';

function memberDisplayName(m: SearchMember): string {
  const fn = (m.first_name || '').trim();
  const ln = (m.last_name || '').trim();
  const full = `${fn} ${ln}`.trim();
  return full || m.name;
}

function canAddToGroup(m: SearchMember): boolean {
  const status = String(m.registration_status ?? 'active').trim().toLowerCase();
  return status !== 'pending_review' && status !== 'rejected';
}

function blockReason(m: SearchMember): string {
  const status = String(m.registration_status ?? 'active').trim().toLowerCase();
  if (status === 'pending_review') return 'Ожидает одобрения регистрации';
  if (status === 'rejected') return 'Регистрация отклонена';
  return 'Этого участника пока нельзя добавить';
}

export function NewChatScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [step, setStep] = useState<WizardStep>('contact');
  const [picked, setPicked] = useState<Record<number, SearchMember>>({});
  const [title, setTitle] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const stepRef = useRef(step);
  const allowLeave = useRef(false);
  stepRef.current = step;

  const searchQuery = useQuery({
    queryKey: ['messenger', 'member-search', query.trim()],
    queryFn: () => searchMembers(query.trim(), { limit: MEMBER_LIMIT }),
    placeholderData: (prev) => prev,
  });

  const pickedList = useMemo(() => Object.values(picked), [picked]);

  useLayoutEffect(() => {
    const headerTitle =
      step === 'members' ? 'Новая группа' : step === 'details' ? 'Название группы' : 'Новый чат';
    navigation.setOptions({ title: headerTitle });
  }, [navigation, step]);

  useEffect(() => {
    return navigation.addListener('beforeRemove', (event) => {
      if (allowLeave.current || stepRef.current === 'contact') return;
      event.preventDefault();
      setFormError(null);
      setStep((current) => (current === 'details' ? 'members' : 'contact'));
    });
  }, [navigation]);

  const createDirect = useMutation({
    mutationFn: (memberId: number) => createPersonalChat(memberId),
    onSuccess: (data, memberId) => {
      const member = searchQuery.data?.find((m) => m.id === memberId);
      const chatTitle = member ? memberDisplayName(member) : 'Чат';
      allowLeave.current = true;
      navigation.replace('ChatThread', {
        conversationId: data.conversationId,
        title: chatTitle,
        isGroup: false,
      });
    },
  });

  const createGroup = useMutation({
    mutationFn: (input: { title: string; memberIds: number[] }) =>
      createGroupChat(input.title, input.memberIds),
    onSuccess: async (data, input) => {
      await queryClient.invalidateQueries({ queryKey: ['messenger', 'conversations'] });
      allowLeave.current = true;
      navigation.replace('ChatThread', {
        conversationId: data.conversationId,
        title: input.title,
        isGroup: true,
      });
    },
  });

  const members = searchQuery.data ?? [];

  const toggleMember = (member: SearchMember) => {
    if (!canAddToGroup(member)) {
      setFormError(blockReason(member));
      return;
    }
    setFormError(null);
    setPicked((prev) => {
      const next = { ...prev };
      if (next[member.id]) delete next[member.id];
      else next[member.id] = member;
      return next;
    });
  };

  const submitGroup = () => {
    const trimmed = title.trim().replace(/\s+/g, ' ');
    if (!trimmed) {
      setFormError('Введите название группы');
      return;
    }
    if (pickedList.length === 0) {
      setFormError('Выберите хотя бы одного участника');
      setStep('members');
      return;
    }
    setFormError(null);
    createGroup.mutate({
      title: trimmed.slice(0, GROUP_TITLE_MAX),
      memberIds: pickedList.map((member) => member.id),
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {step !== 'details' ? (
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Имя или фамилия..."
            placeholderTextColor={colors.textMuted}
            autoFocus={step === 'contact'}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>
      ) : null}

      {step === 'contact' && query.trim().length === 0 ? (
        <Pressable
          onPress={() => {
            setFormError(null);
            setStep('members');
          }}
          style={({ pressed }) => [styles.groupEntry, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.groupIcon}>
            <Ionicons name="people" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.groupEntryTitle}>Новая группа</Text>
            <Text style={styles.groupEntrySub}>Общий чат для нескольких людей</Text>
          </View>
        </Pressable>
      ) : null}

      {step === 'members' && pickedList.length > 0 ? (
        <View style={styles.chips}>
          {pickedList.map((member) => (
            <Pressable key={member.id} onPress={() => toggleMember(member)} style={styles.chip}>
              <ChatAvatar
                name={memberDisplayName(member)}
                imageUrl={member.avatar_url}
                seed={String(member.id)}
                size={44}
              />
              <Text style={styles.chipName} numberOfLines={1}>
                {memberDisplayName(member).split(' ')[0]}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {step === 'details' ? (
        <View style={styles.details}>
          <Text style={styles.detailsHint}>
            {pickedList.length > 0
              ? `Участников: ${pickedList.length}. Название видно всем в списке чатов.`
              : 'Название видно всем в списке чатов.'}
          </Text>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={(value) => {
              setTitle(value.slice(0, GROUP_TITLE_MAX));
              if (formError) setFormError(null);
            }}
            placeholder="Например: Молодёжное служение"
            placeholderTextColor={colors.textMuted}
            autoFocus
            maxLength={GROUP_TITLE_MAX}
            returnKeyType="done"
            onSubmitEditing={submitGroup}
          />
        </View>
      ) : null}

      {searchQuery.isLoading && step !== 'details' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {searchQuery.isError && step !== 'details' ? (
        <ErrorView
          message={searchQuery.error instanceof Error ? searchQuery.error.message : 'Ошибка'}
          onRetry={() => void searchQuery.refetch()}
        />
      ) : null}

      {step !== 'details' && !searchQuery.isLoading && !searchQuery.isError ? (
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
            const selected = Boolean(picked[item.id]);
            const allowed = canAddToGroup(item);
            const busy = createDirect.isPending && createDirect.variables === item.id;
            return (
              <Pressable
                onPress={() => {
                  if (step === 'members') {
                    toggleMember(item);
                    return;
                  }
                  createDirect.mutate(item.id);
                }}
                disabled={step === 'contact' && createDirect.isPending}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: `${colors.primary}10` },
                  step === 'members' && !allowed && { opacity: 0.45 },
                ]}
              >
                {step === 'members' ? (
                  <Ionicons
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={selected ? colors.primary : colors.textMuted}
                  />
                ) : null}
                <ChatAvatar name={name} imageUrl={item.avatar_url} seed={String(item.id)} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{name}</Text>
                  {step === 'members' && !allowed ? (
                    <Text style={styles.blocked}>{blockReason(item)}</Text>
                  ) : item.is_online ? (
                    <Text style={styles.online}>в сети</Text>
                  ) : null}
                </View>
                {busy ? <ActivityIndicator color={colors.primary} /> : null}
              </Pressable>
            );
          }}
        />
      ) : null}

      {step === 'members' ? (
        <View style={styles.footer}>
          <Text style={styles.footerHint}>
            {pickedList.length === 0 ? 'Отметьте хотя бы одного человека' : `Выбрано: ${pickedList.length}`}
          </Text>
          <Pressable
            disabled={pickedList.length === 0}
            onPress={() => {
              setFormError(null);
              setStep('details');
            }}
            style={({ pressed }) => [
              styles.primaryBtn,
              pickedList.length === 0 && { opacity: 0.45 },
              pressed && pickedList.length > 0 && { opacity: 0.9 },
            ]}
          >
            <Text style={styles.primaryBtnText}>Далее</Text>
          </Pressable>
        </View>
      ) : null}

      {step === 'details' ? (
        <View style={styles.footer}>
          <Pressable
            disabled={createGroup.isPending || !title.trim()}
            onPress={submitGroup}
            style={({ pressed }) => [
              styles.primaryBtn,
              (createGroup.isPending || !title.trim()) && { opacity: 0.45 },
              pressed && title.trim() && !createGroup.isPending && { opacity: 0.9 },
            ]}
          >
            {createGroup.isPending ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.primaryBtnText}>Создать группу</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {formError || createDirect.isError || createGroup.isError ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>
            {formError ||
              (createGroup.error instanceof Error
                ? createGroup.error.message
                : createDirect.error instanceof Error
                  ? createDirect.error.message
                  : 'Не удалось создать чат')}
          </Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
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
    groupEntry: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginHorizontal: 16,
      marginBottom: 8,
      padding: 12,
      borderRadius: 14,
      backgroundColor: colors.surfaceElevated,
    },
    groupIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.primary}18`,
    },
    groupEntryTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    groupEntrySub: {
      marginTop: 2,
      fontSize: 12,
      color: colors.textMuted,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    chip: {
      width: 68,
      alignItems: 'center',
      gap: 4,
    },
    chipName: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text,
      maxWidth: 68,
    },
    details: {
      padding: 16,
      gap: 12,
    },
    detailsHint: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    titleInput: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 17,
      color: colors.text,
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
    blocked: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    footer: {
      padding: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: `${colors.textMuted}55`,
      gap: 8,
    },
    footerHint: {
      color: colors.textMuted,
      fontSize: 13,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: {
      color: colors.textOnPrimary,
      fontSize: 16,
      fontWeight: '700',
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
