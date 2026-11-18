import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  fetchChatMembers,
  fetchChatMeta,
  fetchPrivateProfile,
  patchChatPermissions,
  removeChatParticipant,
  updateChat,
} from '../api/chatManage';
import { formatApiError } from '../api/client';
import { fetchConversations, patchMyConversationUi } from '../api/messenger';
import { uploadAttachment } from '../api/messengerUpload';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { ChatAvatar } from '../components/messenger/ChatAvatar';
import { CreateMeetingSheet } from '../components/messenger/CreateMeetingSheet';
import { TextEditModal } from '../components/messenger/TextEditModal';
import {
  canAddToGroup,
  canManageGroup,
  daysUntilBirthday,
  isAppAdmin,
  pluralMembers,
  roleBadge,
  sortMembers,
  splitList,
} from '../lib/chatManage';
import { formatLastSeen } from '../lib/lastSeen';
import { getConversationAvatarUrl } from '../lib/messengerUtils';
import { pickFromGallery } from '../lib/pickAttachments';
import { resolvePublicUrl } from '../lib/resolvePublicUrl';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../stores/authStore';
import { useMessengerRealtimeStore } from '../stores/messengerRealtimeStore';
import { useTheme, type ThemeColors } from '../theme';

const MEMBERS_PREVIEW = 6;
const ROLE_LABELS: Record<string, string> = {
  admin: 'Администратор',
  pastor: 'Пастор',
  minister: 'Служитель',
  editor: 'Редактор',
  musician: 'Музыкант',
  member: 'Член церкви',
  parishioner: 'Прихожанин',
};

function birthText(iso: string | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Профиль чата: собеседника или группы — быстрые действия, информация, участники, медиа, управление. */
export function ChatProfileScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { conversationId, title: titleParam, isGroup } =
    useRoute<RouteProp<RootStackParamList, 'ChatProfile'>>().params;
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.memberId);
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles);
  const online = useMessengerRealtimeStore((s) => s.onlineMembers);
  const lastSeen = useMessengerRealtimeStore((s) => s.memberLastSeenAt);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [editing, setEditing] = useState<'title' | 'description' | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const conversations = useQuery({ queryKey: ['messenger', 'conversations'], queryFn: fetchConversations, staleTime: 30_000 });
  const conv = conversations.data?.find((c) => c.id === conversationId) ?? null;
  const meta = useQuery({ queryKey: ['messenger', 'meta', conversationId], queryFn: () => fetchChatMeta(conversationId) });
  const members = useQuery({
    queryKey: ['messenger', 'members', conversationId],
    queryFn: () => fetchChatMembers(conversationId),
    enabled: isGroup,
  });
  const privateProfile = useQuery({
    queryKey: ['messenger', 'private-profile', conversationId],
    queryFn: () => fetchPrivateProfile(conversationId),
    enabled: !isGroup,
  });

  const appAdmin = isAppAdmin(role, roles);
  const canManage = isGroup && canManageGroup(meta.data?.my_effective_permissions, appAdmin);
  const canAdd = isGroup && canAddToGroup(meta.data?.my_effective_permissions, appAdmin);
  const isChannel = meta.data?.type === 'channel' || conv?.type === 'channel';
  const muted = conv?.my_muted === true;
  const title = meta.data?.title ?? conv?.title ?? titleParam ?? (isGroup ? 'Группа' : 'Чат');
  const description = String(meta.data?.settings.description ?? '').trim();
  const avatar = isGroup
    ? resolvePublicUrl(meta.data?.avatar_url ?? null) ?? (conv ? getConversationAvatarUrl(conv) : null)
    : resolvePublicUrl(privateProfile.data?.avatar_url ?? null) ?? (conv ? getConversationAvatarUrl(conv) : null);

  const sorted = useMemo(
    () => sortMembers(members.data ?? [], online, lastSeen),
    [members.data, online, lastSeen],
  );
  const onlineCount = sorted.filter((m) => m.online).length;

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ['messenger', 'meta', conversationId] });
    void qc.invalidateQueries({ queryKey: ['messenger', 'conversations'] });
  };

  const muteMut = useMutation({
    mutationFn: () => patchMyConversationUi(conversationId, { muted: !muted }),
    onSuccess: refreshAll,
    onError: (e) => Alert.alert('Не удалось изменить уведомления', formatApiError(e)),
  });

  const saveText = useMutation({
    mutationFn: async ({ kind, value }: { kind: 'title' | 'description'; value: string }) => {
      if (kind === 'title') await updateChat(conversationId, { title: value });
      else
        await patchChatPermissions(conversationId, {
          settings: { ...(meta.data?.settings ?? {}), description: value.slice(0, 255) },
        });
    },
    onSuccess: () => {
      setEditing(null);
      setEditError(null);
      refreshAll();
    },
    onError: (e) => setEditError(`Не удалось сохранить: ${formatApiError(e)}`),
  });

  const avatarMut = useMutation({
    mutationFn: async () => {
      const picked = await pickFromGallery(1);
      if (picked.error) throw new Error(picked.error);
      const file = picked.items.find((i) => i.kind === 'image');
      if (!file) return;
      const up = await uploadAttachment(file, { conversationId });
      await updateChat(conversationId, { avatar_url: up.url });
    },
    onSuccess: refreshAll,
    onError: (e) => Alert.alert('Не удалось обновить фото', formatApiError(e)),
  });

  const leaveMut = useMutation({
    mutationFn: () => removeChatParticipant(conversationId, me ?? 0),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['messenger', 'conversations'] });
      navigation.popToTop();
    },
    onError: (e) => Alert.alert('Не удалось выйти', formatApiError(e)),
  });

  const confirmLeave = () => {
    const owner = meta.data?.my_role === 'owner';
    const noun = isChannel ? 'канал' : 'группу';
    Alert.alert(
      owner ? `Удалить ${noun}?` : `Выйти из чата?`,
      owner
        ? `${noun[0]!.toUpperCase()}${noun.slice(1)} будет удалена для всех участников, переписка сотрётся.`
        : 'Вас нужно будет снова пригласить.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: owner ? 'Удалить для всех' : 'Выйти', style: 'destructive', onPress: () => leaveMut.mutate() },
      ],
    );
  };

  if (meta.isPending && !conv) return <LoadingView />;
  if (meta.isError && !conv) return <ErrorView message={formatApiError(meta.error)} onRetry={() => void meta.refetch()} />;

  const pp = privateProfile.data;
  const phone = pp?.phone_number?.trim() ?? '';
  const birth = birthText(pp?.birth_date ?? null);
  const birthIn = daysUntilBirthday(pp?.birth_date);
  const ministry = splitList(pp?.ministry_role);
  const directions = splitList(pp?.ministry_direction);
  const appRoles = splitList(pp?.app_role).map((r) => ROLE_LABELS[r.toLowerCase()] ?? r);
  const peerId = conv?.other_member?.id ?? pp?.id ?? null;
  const peerOnline = peerId != null && online.has(peerId);
  const subtitle = isGroup
    ? members.data
      ? `${pluralMembers(sorted.length, isChannel)}${onlineCount > 0 ? `, ${onlineCount} в сети` : ''}`
      : ' '
    : peerOnline
      ? 'в сети'
      : formatLastSeen((peerId != null ? lastSeen[peerId] : undefined) ?? pp?.last_seen_at ?? conv?.other_member?.last_seen_at);

  const Tile = ({
    icon,
    label,
    onPress,
    active,
    busy,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
    active?: boolean;
    busy?: boolean;
  }) => (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tile, active && styles.tileActive, pressed && { opacity: 0.8 }]}
    >
      {busy ? <ActivityIndicator color={colors.primary} /> : <Ionicons name={icon} size={24} color={colors.primary} />}
      <Text style={styles.tileText}>{label}</Text>
    </Pressable>
  );

  const Row = ({
    icon,
    label,
    value,
    onPress,
    danger,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value?: string;
    onPress: () => void;
    danger?: boolean;
  }) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.primary + '10' }]}
    >
      <Ionicons name={icon} size={22} color={danger ? '#DC2626' : colors.primary} />
      <Text style={[styles.listRowText, danger && { color: '#DC2626' }]}>{label}</Text>
      {value ? <Text style={styles.listRowValue}>{value}</Text> : null}
      {!danger ? <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} /> : null}
    </Pressable>
  );

  return (
    <View style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Pressable
            onPress={canManage ? () => avatarMut.mutate() : undefined}
            disabled={!canManage || avatarMut.isPending}
            accessibilityRole={canManage ? 'button' : undefined}
            accessibilityLabel={canManage ? 'Сменить фото группы' : undefined}
          >
            <ChatAvatar name={title} imageUrl={avatar} seed={conversationId} size={104} showOnline={!isGroup} isOnline={peerOnline} />
            {avatarMut.isPending ? <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.primary} /> : null}
            {canManage ? (
              <View style={styles.camBadge}>
                <Ionicons name="camera" size={16} color={colors.textOnPrimary} />
              </View>
            ) : null}
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Text style={[styles.subtitle, !isGroup && peerOnline && { color: colors.primary }]}>{subtitle}</Text>
        </View>

        <View style={styles.tiles}>
          <Tile icon="chatbubble-outline" label="Чат" onPress={() => navigation.goBack()} />
          <Tile
            icon={muted ? 'notifications-off' : 'notifications-outline'}
            label={muted ? 'Включить' : 'Звук'}
            onPress={() => muteMut.mutate()}
            active={muted}
            busy={muteMut.isPending}
          />
          <Tile icon="videocam-outline" label="Созвон" onPress={() => setMeetingOpen(true)} />
          {canAdd ? (
            <Tile
              icon="person-add-outline"
              label="Добавить"
              onPress={() => navigation.navigate('ChatMembers', { conversationId, isChannel })}
            />
          ) : null}
        </View>

        {isGroup ? (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardLabel}>Описание</Text>
              {canManage ? (
                <Pressable onPress={() => setEditing('description')} accessibilityRole="button" style={styles.editBtn}>
                  <Text style={styles.editText}>Изменить</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={description ? styles.body : styles.muted}>{description || 'Описание не добавлено'}</Text>
          </View>
        ) : null}

        {!isGroup ? (
          <View style={styles.card}>
            {privateProfile.isPending ? <ActivityIndicator color={colors.primary} /> : null}
            {phone ? (
              <View style={styles.infoRow}>
                <Text style={styles.cardLabel}>Телефон</Text>
                <View style={styles.phoneLine}>
                  <Text style={styles.body} selectable>
                    {phone}
                  </Text>
                  <Pressable
                    onPress={() => void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`)}
                    accessibilityRole="button"
                    accessibilityLabel="Позвонить"
                    style={styles.iconBtn}
                  >
                    <Ionicons name="call-outline" size={22} color={colors.primary} />
                  </Pressable>
                  <Pressable
                    onPress={() => void Clipboard.setStringAsync(phone)}
                    accessibilityRole="button"
                    accessibilityLabel="Скопировать номер"
                    style={styles.iconBtn}
                  >
                    <Ionicons name="copy-outline" size={22} color={colors.primary} />
                  </Pressable>
                </View>
              </View>
            ) : null}
            {appRoles.length > 0 ? (
              <View style={styles.infoRow}>
                <Text style={styles.cardLabel}>Роль в приложении</Text>
                <Text style={styles.body}>{appRoles.join(', ')}</Text>
              </View>
            ) : null}
            {ministry.length > 0 ? (
              <View style={styles.infoRow}>
                <Text style={styles.cardLabel}>Служение</Text>
                <Text style={styles.body}>{ministry.join(', ')}</Text>
              </View>
            ) : null}
            {directions.length > 0 ? (
              <View style={styles.infoRow}>
                <Text style={styles.cardLabel}>Направление</Text>
                <Text style={styles.body}>{directions.join(', ')}</Text>
              </View>
            ) : null}
            {birth ? (
              <View style={styles.infoRow}>
                <Text style={styles.cardLabel}>День рождения</Text>
                <Text style={styles.body}>
                  {birth}
                  {birthIn === 0 ? ' · сегодня 🎉' : birthIn != null && birthIn <= 30 ? ` · через ${birthIn} дн.` : ''}
                </Text>
              </View>
            ) : null}
            {!privateProfile.isPending && !phone && !birth && !appRoles.length && !ministry.length && !directions.length ? (
              <Text style={styles.muted}>Участник не добавил информацию о себе.</Text>
            ) : null}
          </View>
        ) : null}

        {isGroup ? (
          <View style={styles.card}>
            <Text style={[styles.cardLabel, { marginBottom: 4 }]}>
              {members.data ? pluralMembers(sorted.length, isChannel) : 'Участники'}
            </Text>
            {members.isPending ? <ActivityIndicator color={colors.primary} style={{ margin: 12 }} /> : null}
            {sorted.slice(0, MEMBERS_PREVIEW).map((m) => (
              <View key={m.member_id} style={styles.memberRow}>
                <ChatAvatar
                  name={m.displayName}
                  imageUrl={resolvePublicUrl(m.avatar_url)}
                  seed={String(m.member_id)}
                  size={44}
                  showOnline
                  isOnline={m.online}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {m.displayName}
                  </Text>
                  <Text style={[styles.sub, m.online && { color: colors.primary }]}>
                    {m.online ? 'в сети' : formatLastSeen(m.seen)}
                  </Text>
                </View>
                {roleBadge(m.role) ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{roleBadge(m.role)}</Text>
                  </View>
                ) : null}
              </View>
            ))}
            <Row
              icon="people-outline"
              label={sorted.length > MEMBERS_PREVIEW ? `Все участники (${sorted.length})` : 'Участники'}
              onPress={() => navigation.navigate('ChatMembers', { conversationId, isChannel })}
            />
          </View>
        ) : null}

        <View style={styles.card}>
          <Row
            icon="images-outline"
            label="Медиа, файлы и ссылки"
            onPress={() => navigation.navigate('ChatMedia', { conversationId })}
          />
          {canManage ? (
            <>
              <Row icon="create-outline" label="Название" value={title} onPress={() => setEditing('title')} />
              <Row
                icon="lock-closed-outline"
                label="Разрешения"
                onPress={() => navigation.navigate('ChatPermissions', { conversationId })}
              />
            </>
          ) : null}
        </View>

        {isGroup ? (
          <View style={styles.card}>
            <Row
              icon="exit-outline"
              label={meta.data?.my_role === 'owner' ? (isChannel ? 'Удалить канал' : 'Удалить группу') : 'Выйти из чата'}
              danger
              onPress={confirmLeave}
            />
          </View>
        ) : null}
      </ScrollView>

      <TextEditModal
        visible={editing != null}
        title={editing === 'title' ? 'Название чата' : 'Описание'}
        initial={editing === 'title' ? title : description}
        maxLength={editing === 'title' ? 100 : 255}
        multiline={editing === 'description'}
        required={editing === 'title'}
        saving={saveText.isPending}
        error={editError}
        onSave={(value) => editing && saveText.mutate({ kind: editing, value })}
        onClose={() => {
          setEditing(null);
          setEditError(null);
        }}
      />
      <CreateMeetingSheet
        visible={meetingOpen}
        onClose={() => setMeetingOpen(false)}
        conversationId={conversationId}
        conversationTitle={title}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    content: { padding: 16, gap: 14, paddingBottom: 40 },
    hero: { alignItems: 'center', gap: 6, paddingVertical: 8 },
    camBadge: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 6 },
    subtitle: { fontSize: 15, color: colors.textSecondary },
    tiles: { flexDirection: 'row', gap: 10 },
    tile: {
      flex: 1,
      minHeight: 76,
      borderRadius: 16,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    tileActive: { backgroundColor: colors.primary + '1F' },
    tileText: { fontSize: 14, fontWeight: '700', color: colors.primary },
    card: { borderRadius: colors.radius, backgroundColor: colors.surfaceElevated, paddingHorizontal: 16, paddingVertical: 12, gap: 6 },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.textSecondary },
    editBtn: { minHeight: 44, justifyContent: 'center' },
    editText: { fontSize: 15, fontWeight: '700', color: colors.primary },
    body: { fontSize: 17, lineHeight: 25, color: colors.text },
    muted: { fontSize: 16, lineHeight: 24, color: colors.textSecondary, fontStyle: 'italic' },
    infoRow: { gap: 2, paddingVertical: 4 },
    phoneLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
    memberName: { fontSize: 17, fontWeight: '700', color: colors.text },
    sub: { fontSize: 14, color: colors.textSecondary },
    badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.primary + '1F' },
    badgeText: { fontSize: 12, fontWeight: '800', color: colors.primary },
    listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderRadius: 12 },
    listRowText: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.text },
    listRowValue: { maxWidth: 140, fontSize: 15, color: colors.textSecondary },
  });
}
