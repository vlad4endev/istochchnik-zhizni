import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  addChatParticipant,
  fetchChatMembers,
  fetchChatMeta,
  patchChatMember,
  removeChatParticipant,
  type PermissionKey,
} from '../api/chatManage';
import { formatApiError } from '../api/client';
import { createPersonalChat, searchMembers, type SearchMember } from '../api/messenger';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { ActionSheet, type ActionSheetItem } from '../components/messenger/ActionSheet';
import { ChatAvatar } from '../components/messenger/ChatAvatar';
import {
  PERMISSION_ROWS,
  canAddToGroup,
  canManageGroup,
  isAppAdmin,
  memberPermissions,
  pluralMembers,
  roleBadge,
  sortMembers,
  type MemberRow,
} from '../lib/chatManage';
import { formatLastSeen } from '../lib/lastSeen';
import { resolvePublicUrl } from '../lib/resolvePublicUrl';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../stores/authStore';
import { useMessengerRealtimeStore } from '../stores/messengerRealtimeStore';
import { useTheme, type ThemeColors } from '../theme';

/** Все участники группы: поиск, добавление, назначение админа, права и удаление. */
export function ChatMembersScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { conversationId, isChannel } = useRoute<RouteProp<RootStackParamList, 'ChatMembers'>>().params;
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.memberId);
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles);
  const online = useMessengerRealtimeStore((s) => s.onlineMembers);
  const lastSeen = useMessengerRealtimeStore((s) => s.memberLastSeenAt);
  const [query, setQuery] = useState('');
  const [menuFor, setMenuFor] = useState<MemberRow | null>(null);
  const [permsFor, setPermsFor] = useState<MemberRow | null>(null);
  const [adding, setAdding] = useState(false);

  const meta = useQuery({
    queryKey: ['messenger', 'meta', conversationId],
    queryFn: () => fetchChatMeta(conversationId),
  });
  const members = useQuery({
    queryKey: ['messenger', 'members', conversationId],
    queryFn: () => fetchChatMembers(conversationId),
  });

  const appAdmin = isAppAdmin(role, roles);
  const canManage = canManageGroup(meta.data?.my_effective_permissions, appAdmin);
  const canAdd = canAddToGroup(meta.data?.my_effective_permissions, appAdmin);

  const rows = useMemo(() => {
    const sorted = sortMembers(members.data ?? [], online, lastSeen);
    const q = query.trim().toLowerCase();
    return q ? sorted.filter((m) => m.displayName.toLowerCase().includes(q)) : sorted;
  }, [members.data, online, lastSeen, query]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['messenger', 'members', conversationId] });
    void qc.invalidateQueries({ queryKey: ['messenger', 'participants-count', conversationId] });
  };

  const promote = useMutation({
    mutationFn: (m: MemberRow) => patchChatMember(conversationId, m.member_id, { role: 'admin' }),
    onSuccess: refresh,
    onError: (e) => Alert.alert('Не удалось назначить админом', formatApiError(e)),
  });
  const remove = useMutation({
    mutationFn: (m: MemberRow) => removeChatParticipant(conversationId, m.member_id),
    onSuccess: refresh,
    onError: (e) => Alert.alert('Не удалось удалить участника', formatApiError(e)),
  });

  const openDirect = async (m: MemberRow) => {
    try {
      const { conversationId: id } = await createPersonalChat(m.member_id);
      navigation.navigate('ChatThread', { conversationId: id, title: m.displayName, isGroup: false });
    } catch (e) {
      Alert.alert('Не удалось открыть чат', formatApiError(e));
    }
  };

  const menuItems = (m: MemberRow): ActionSheetItem[] => {
    const items: ActionSheetItem[] = [];
    if (m.member_id !== me) {
      items.push({ key: 'dm', label: 'Написать', icon: 'chatbubble-outline', onPress: () => void openDirect(m) });
    }
    if (canManage && m.role === 'member') {
      items.push({
        key: 'admin',
        label: 'Назначить администратором',
        icon: 'shield-checkmark-outline',
        onPress: () => promote.mutate(m),
      });
    }
    if (canManage && m.role !== 'owner') {
      items.push({ key: 'perms', label: 'Права участника', icon: 'options-outline', onPress: () => setPermsFor(m) });
    }
    if (canManage && m.role !== 'owner' && m.member_id !== me) {
      items.push({
        key: 'remove',
        label: 'Удалить из чата',
        icon: 'person-remove-outline',
        danger: true,
        onPress: () =>
          Alert.alert('Удалить участника?', `${m.displayName} потеряет доступ к чату.`, [
            { text: 'Отмена', style: 'cancel' },
            { text: 'Удалить', style: 'destructive', onPress: () => remove.mutate(m) },
          ]),
      });
    }
    return items;
  };

  if (members.isPending) return <LoadingView />;
  if (members.isError) {
    return <ErrorView message={formatApiError(members.error)} onRetry={() => void members.refetch()} />;
  }

  return (
    <View style={styles.safe}>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Поиск по имени"
          placeholderTextColor={colors.textMuted}
          style={styles.search}
          clearButtonMode="while-editing"
          accessibilityLabel="Поиск участников"
        />
      </View>
      <Text style={styles.count}>{pluralMembers(members.data?.length ?? 0, isChannel)}</Text>

      {canAdd ? (
        <Pressable
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.addRow, pressed && { opacity: 0.8 }]}
        >
          <View style={styles.addIcon}>
            <Ionicons name="person-add" size={22} color={colors.textOnPrimary} />
          </View>
          <Text style={styles.addText}>Добавить участников</Text>
        </Pressable>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(m) => String(m.member_id)}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.empty}>Никого не найдено</Text>}
        renderItem={({ item }) => {
          const badge = roleBadge(item.role);
          const items = menuItems(item);
          return (
            <Pressable
              onPress={() => items.length > 0 && setMenuFor(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.displayName}${badge ? `, ${badge}` : ''}`}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.primary + '10' }]}
            >
              <ChatAvatar
                name={item.displayName}
                imageUrl={resolvePublicUrl(item.avatar_url)}
                seed={String(item.member_id)}
                size={48}
                showOnline
                isOnline={item.online}
              />
              <View style={styles.texts}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.displayName}
                  {item.member_id === me ? ' (вы)' : ''}
                </Text>
                <Text style={[styles.sub, item.online && { color: colors.primary }]} numberOfLines={1}>
                  {item.online ? 'в сети' : formatLastSeen(item.seen)}
                </Text>
              </View>
              {badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />

      <ActionSheet
        visible={menuFor != null}
        title={menuFor?.displayName}
        items={menuFor ? menuItems(menuFor) : []}
        onClose={() => setMenuFor(null)}
      />
      {permsFor && meta.data ? (
        <MemberPermissionsModal
          conversationId={conversationId}
          member={permsFor}
          defaults={meta.data.default_permissions}
          onClose={() => setPermsFor(null)}
          onSaved={() => {
            setPermsFor(null);
            refresh();
          }}
        />
      ) : null}
      <AddMembersModal
        visible={adding}
        conversationId={conversationId}
        existingIds={new Set((members.data ?? []).map((m) => m.member_id))}
        onClose={() => setAdding(false)}
        onAdded={refresh}
      />
    </View>
  );
}

function MemberPermissionsModal({
  conversationId,
  member,
  defaults,
  onClose,
  onSaved,
}: {
  conversationId: string;
  member: MemberRow;
  defaults: Parameters<typeof memberPermissions>[1];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [p, setP] = useState(() => memberPermissions(member, defaults));
  const save = useMutation({
    mutationFn: () => patchChatMember(conversationId, member.member_id, { permissions: p }),
    onSuccess: onSaved,
  });
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.modalHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>Права участника</Text>
            <Text style={styles.sub} numberOfLines={1}>
              {member.displayName}
            </Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" style={styles.closeBtn}>
            <Text style={styles.closeText}>Отмена</Text>
          </Pressable>
        </View>
        <View style={{ padding: 16, gap: 8 }}>
          {PERMISSION_ROWS.map((row) => (
            <View key={row.key} style={styles.permRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{row.title}</Text>
                <Text style={styles.sub}>{row.description}</Text>
              </View>
              <Switch
                value={p[row.key as PermissionKey]}
                onValueChange={(v) => setP((s) => ({ ...s, [row.key]: v }))}
                accessibilityLabel={row.title}
              />
            </View>
          ))}
          {save.isError ? <Text style={styles.error}>Не удалось сохранить: {formatApiError(save.error)}</Text> : null}
        </View>
        <View style={{ padding: 16 }}>
          <Pressable
            onPress={() => save.mutate()}
            disabled={save.isPending}
            accessibilityRole="button"
            style={[styles.primary, save.isPending && { opacity: 0.6 }]}
          >
            {save.isPending ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.primaryText}>Сохранить</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function AddMembersModal({
  visible,
  conversationId,
  existingIds,
  onClose,
  onAdded,
}: {
  visible: boolean;
  conversationId: string;
  existingIds: Set<number>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [added, setAdded] = useState<Set<number>>(() => new Set());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => {
    if (!visible) {
      setQ('');
      setAdded(new Set());
      setError(null);
    }
  }, [visible]);

  const results = useQuery({
    queryKey: ['messenger', 'member-search', debounced],
    queryFn: () => searchMembers(debounced, { limit: 30 }),
    enabled: visible && debounced.length >= 2,
  });

  const add = async (m: SearchMember) => {
    setBusyId(m.id);
    setError(null);
    try {
      await addChatParticipant(conversationId, m.id);
      setAdded((prev) => new Set(prev).add(m.id));
      onAdded();
    } catch (e) {
      setError(`Не удалось добавить: ${formatApiError(e)}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalHead}>
            <Text style={[styles.modalTitle, { flex: 1 }]}>Добавить участников</Text>
            <Pressable onPress={onClose} accessibilityRole="button" style={styles.closeBtn}>
              <Text style={styles.closeText}>Готово</Text>
            </Pressable>
          </View>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={20} color={colors.textSecondary} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Имя или фамилия (от 2 букв)"
              placeholderTextColor={colors.textMuted}
              style={styles.search}
              autoFocus
              accessibilityLabel="Поиск участников церкви"
            />
          </View>
          {error ? <Text style={[styles.error, { paddingHorizontal: 16 }]}>{error}</Text> : null}
          {results.isFetching ? <ActivityIndicator color={colors.primary} style={{ margin: 12 }} /> : null}
          <FlatList
            data={(results.data ?? []).filter((m) => m.registration_status !== 'rejected')}
            keyExtractor={(m) => String(m.id)}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              debounced.length >= 2 && !results.isFetching ? (
                <Text style={styles.empty}>Никого не найдено</Text>
              ) : (
                <Text style={styles.empty}>Введите имя, чтобы найти участника.</Text>
              )
            }
            renderItem={({ item }) => {
              const name = [item.first_name, item.last_name].filter(Boolean).join(' ').trim() || item.name;
              const inChat = existingIds.has(item.id) || added.has(item.id);
              const approved = item.registration_status === undefined || item.registration_status === 'active';
              return (
                <View style={styles.row}>
                  <ChatAvatar
                    name={name}
                    imageUrl={resolvePublicUrl(item.avatar_url ?? null)}
                    seed={String(item.id)}
                    size={46}
                  />
                  <View style={styles.texts}>
                    <Text style={styles.name} numberOfLines={1}>
                      {name}
                    </Text>
                    {!approved ? <Text style={styles.sub}>Ожидает одобрения регистрации</Text> : null}
                  </View>
                  <Pressable
                    onPress={() => void add(item)}
                    disabled={inChat || !approved || busyId === item.id}
                    accessibilityRole="button"
                    accessibilityLabel={inChat ? `${name} уже в чате` : `Добавить ${name}`}
                    style={[styles.smallBtn, (inChat || !approved) && { opacity: 0.5 }]}
                  >
                    {busyId === item.id ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Text style={styles.smallBtnText}>{inChat ? 'В чате' : 'Добавить'}</Text>
                    )}
                  </Pressable>
                </View>
              );
            }}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginVertical: 8,
      paddingHorizontal: 12,
      minHeight: 46,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
    },
    search: { flex: 1, fontSize: 17, color: colors.text, paddingVertical: 8 },
    count: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, paddingHorizontal: 16, paddingBottom: 4 },
    addRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 60 },
    addIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addText: { fontSize: 17, fontWeight: '700', color: colors.primary },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 68 },
    texts: { flex: 1, minWidth: 0 },
    name: { fontSize: 17, fontWeight: '700', color: colors.text },
    sub: { fontSize: 14, color: colors.textSecondary, marginTop: 1 },
    badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.primary + '1F' },
    badgeText: { fontSize: 12, fontWeight: '800', color: colors.primary },
    empty: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', padding: 32 },
    error: { fontSize: 15, color: '#B42318' },
    modalHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
    modalTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
    closeBtn: { minHeight: 48, justifyContent: 'center' },
    closeText: { fontSize: 16, fontWeight: '700', color: colors.primary },
    permRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      minHeight: 68,
      borderRadius: 14,
      backgroundColor: colors.surfaceElevated,
    },
    primary: {
      minHeight: 54,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryText: { fontSize: 17, fontWeight: '800', color: colors.textOnPrimary },
    smallBtn: {
      minHeight: 44,
      minWidth: 96,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    smallBtnText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  });
}
