import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  fetchConversationMembers,
  fetchConversationMeta,
  fetchConversations,
  fetchPrivateChatProfile,
  addParticipant,
  mergeDefaultChatPermissions,
  patchConversationMember,
  patchConversationPermissions,
  patchMyConversationUi,
  removeParticipant,
  updateConversation,
  type ChatPermissionKey,
  type ConversationMember,
  type ParticipantRole,
} from '../api/messenger';
import { AddMembersSheet } from '../components/messenger/AddMembersSheet';
import { ChatAvatar } from '../components/messenger/ChatAvatar';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import {
  getConversationAvatarUrl,
  getConversationTitle,
} from '../lib/messengerUtils';
import { resolvePublicUrl } from '../lib/resolvePublicUrl';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../stores/authStore';
import { useTheme } from '../theme';

type ChatInfoRoute = RouteProp<RootStackParamList, 'ChatInfo'>;

const INVITE_BASE = 'https://app.church-tambov.ru/join';

const PERMISSION_ROWS: { key: ChatPermissionKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'can_send_messages', label: 'Отправлять сообщения', icon: 'chatbubble-outline' },
  { key: 'can_send_media', label: 'Отправлять медиа', icon: 'image-outline' },
  { key: 'can_add_users', label: 'Добавлять участников', icon: 'person-add-outline' },
  { key: 'can_pin_messages', label: 'Закреплять сообщения', icon: 'pin-outline' },
  { key: 'can_manage_chat', label: 'Управлять чатом', icon: 'shield-outline' },
];

function randomInviteToken(): string {
  return Math.random().toString(36).slice(2, 12);
}

function inviteTokenFromMeta(settings: Record<string, unknown> | undefined): string {
  const raw = settings?.invite_token;
  return typeof raw === 'string' ? raw.trim() : '';
}

function roleLabel(role: ParticipantRole): string {
  if (role === 'owner') return 'создатель';
  if (role === 'admin') return 'админ';
  return 'участник';
}

function memberDisplayName(m: ConversationMember): string {
  const full = `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim();
  return full || m.name || `Участник ${m.member_id}`;
}

function typeLabel(type: string | undefined): string {
  if (type === 'channel') return 'Канал';
  if (type === 'group') return 'Группа';
  if (type === 'private') return 'Личный чат';
  return 'Чат';
}

export function ChatInfoScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<ChatInfoRoute>();
  const { conversationId, title: paramTitle } = route.params;
  const memberId = useAuthStore((s) => s.memberId);
  const queryClient = useQueryClient();
  const [renameOpen, setRenameOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [permDraft, setPermDraft] = useState<Record<ChatPermissionKey, boolean> | null>(null);
  const inviteBootstrapRef = useRef(false);

  const conversationsQuery = useQuery({
    queryKey: ['messenger', 'conversations'],
    queryFn: fetchConversations,
    staleTime: 30_000,
  });

  const conversation = useMemo(
    () => conversationsQuery.data?.find((c) => c.id === conversationId) ?? null,
    [conversationsQuery.data, conversationId],
  );

  const metaQuery = useQuery({
    queryKey: ['messenger', 'meta', conversationId],
    queryFn: () => fetchConversationMeta(conversationId),
  });

  const isPrivate =
    (conversation?.type ?? metaQuery.data?.type) === 'private';

  const membersQuery = useQuery({
    queryKey: ['messenger', 'members', conversationId],
    queryFn: () => fetchConversationMembers(conversationId),
    enabled: !isPrivate && (conversation != null || metaQuery.isSuccess),
  });

  const privateQuery = useQuery({
    queryKey: ['messenger', 'private-profile', conversationId],
    queryFn: () => fetchPrivateChatProfile(conversationId),
    enabled: isPrivate,
  });

  const muteMutation = useMutation({
    mutationFn: (muted: boolean) => patchMyConversationUi(conversationId, { muted }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['messenger', 'conversations'] });
    },
    onError: () => {
      Alert.alert('Ошибка', 'Не удалось изменить уведомления');
    },
  });

  const renameMutation = useMutation({
    mutationFn: (nextTitle: string) => updateConversation(conversationId, { title: nextTitle }),
    onSuccess: async () => {
      setRenameOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['messenger', 'conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['messenger', 'meta', conversationId] }),
      ]);
      Alert.alert('Готово', 'Название сохранено');
    },
    onError: () => {
      Alert.alert('Ошибка', 'Не удалось сохранить название');
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (token: string) => {
      const currentSettings =
        (metaQuery.data?.settings as Record<string, unknown> | undefined) ?? {};
      await patchConversationPermissions(conversationId, {
        settings: { ...currentSettings, invite_token: token },
      });
      return token;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['messenger', 'meta', conversationId] });
    },
    onError: () => {
      Alert.alert('Ошибка', 'Не удалось обновить ссылку-приглашение');
    },
  });

  const permissionsMutation = useMutation({
    mutationFn: (next: Record<ChatPermissionKey, boolean>) =>
      patchConversationPermissions(conversationId, { default_permissions: next }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['messenger', 'meta', conversationId] });
    },
    onError: () => {
      Alert.alert('Ошибка', 'Не удалось сохранить разрешения');
      if (metaQuery.data) {
        setPermDraft(mergeDefaultChatPermissions(metaQuery.data.default_permissions));
      }
    },
  });

  useEffect(() => {
    if (!metaQuery.data) return;
    setPermDraft(mergeDefaultChatPermissions(metaQuery.data.default_permissions));
  }, [metaQuery.data]);

  const canManage = metaQuery.data?.my_effective_permissions?.can_manage_chat === true;
  const canAddUsers = metaQuery.data?.my_effective_permissions?.can_add_users === true;
  const myRole = metaQuery.data?.my_role;
  const canKick =
    canManage || myRole === 'owner' || myRole === 'admin';
  const inviteToken = inviteTokenFromMeta(
    metaQuery.data?.settings as Record<string, unknown> | undefined,
  );
  const inviteLink = inviteToken ? `${INVITE_BASE}/${inviteToken}` : '';

  useEffect(() => {
    if (isPrivate || !canManage || !metaQuery.isSuccess) return;
    if (inviteToken) {
      inviteBootstrapRef.current = true;
      return;
    }
    if (inviteBootstrapRef.current || inviteMutation.isPending) return;
    inviteBootstrapRef.current = true;
    inviteMutation.mutate(randomInviteToken());
    // Bootstrap invite token once for managers when missing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPrivate, canManage, metaQuery.isSuccess, inviteToken]);

  const copyInvite = async () => {
    if (!inviteLink) return;
    try {
      await Clipboard.setStringAsync(inviteLink);
      Alert.alert('Скопировано', 'Ссылка-приглашение скопирована');
    } catch {
      Alert.alert('Ошибка', 'Не удалось скопировать ссылку');
    }
  };

  const resetInvite = () => {
    Alert.alert(
      'Сбросить ссылку?',
      'Старая ссылка перестанет действовать.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Сбросить',
          style: 'destructive',
          onPress: () => inviteMutation.mutate(randomInviteToken()),
        },
      ],
    );
  };

  const leaveMutation = useMutation({
    mutationFn: async () => {
      if (memberId == null) throw new Error('Нет текущего участника');
      await removeParticipant(conversationId, memberId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['messenger', 'conversations'] });
      await queryClient.invalidateQueries({ queryKey: ['messenger', 'unread'] });
      navigation.popToTop();
    },
    onError: () => {
      Alert.alert('Ошибка', 'Не удалось покинуть чат');
    },
  });

  const kickMutation = useMutation({
    mutationFn: (targetId: number) => removeParticipant(conversationId, targetId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['messenger', 'members', conversationId],
      });
      await queryClient.invalidateQueries({ queryKey: ['messenger', 'meta', conversationId] });
    },
    onError: () => {
      Alert.alert('Ошибка', 'Не удалось исключить участника');
    },
  });

  const roleMutation = useMutation({
    mutationFn: (input: { targetId: number; role: ParticipantRole }) =>
      patchConversationMember(conversationId, input.targetId, { role: input.role }),
    onSuccess: async (_data, vars) => {
      await queryClient.invalidateQueries({
        queryKey: ['messenger', 'members', conversationId],
      });
      Alert.alert(
        'Готово',
        vars.role === 'admin' ? 'Назначен администратором' : 'Права администратора сняты',
      );
    },
    onError: () => {
      Alert.alert('Ошибка', 'Не удалось изменить роль участника');
    },
  });

  const addMember = async (targetId: number) => {
    const result = await addParticipant(conversationId, targetId);
    await queryClient.invalidateQueries({
      queryKey: ['messenger', 'members', conversationId],
    });
    await queryClient.invalidateQueries({ queryKey: ['messenger', 'meta', conversationId] });
    if (result.alreadyMember) {
      Alert.alert('Уже в чате', 'Этот человек уже состоит в группе');
      return;
    }
    Alert.alert('Готово', 'Участник добавлен');
  };

  const loading =
    conversationsQuery.isLoading ||
    metaQuery.isLoading ||
    (isPrivate ? privateQuery.isLoading : membersQuery.isLoading);

  if (loading && !conversation && !metaQuery.data) {
    return <LoadingView />;
  }

  if (metaQuery.isError && !metaQuery.data) {
    return (
      <View style={styles.pad}>
        <ErrorView
          message="Не удалось загрузить сведения о чате"
          onRetry={() => {
            void metaQuery.refetch();
          }}
        />
      </View>
    );
  }

  const meta = metaQuery.data;
  const displayTitle =
    (conversation ? getConversationTitle(conversation) : null) ||
    meta?.title ||
    paramTitle ||
    'Чат';
  const avatarUrl = resolvePublicUrl(
    conversation
      ? getConversationAvatarUrl(conversation)
      : (meta?.avatar_url ?? null),
  );
  const isMuted = conversation?.my_muted === true;
  const members = membersQuery.data ?? [];
  const memberCount = members.length;

  const openRename = () => {
    setTitleDraft(meta?.title ?? conversation?.title ?? '');
    setRenameOpen(true);
  };

  const confirmLeave = () => {
    Alert.alert(
      'Покинуть группу?',
      'Вас нужно будет снова пригласить, чтобы вернуться.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Покинуть',
          style: 'destructive',
          onPress: () => leaveMutation.mutate(),
        },
      ],
    );
  };

  const confirmKick = (m: ConversationMember) => {
    if (!canKick) return;
    if (memberId != null && m.member_id === memberId) return;
    if (m.role === 'owner') {
      Alert.alert('Нельзя исключить', 'Создателя группы исключить нельзя');
      return;
    }
    const name = memberDisplayName(m);
    Alert.alert('Исключить участника?', name, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Исключить',
        style: 'destructive',
        onPress: () => kickMutation.mutate(m.member_id),
      },
    ]);
  };

  const openMemberActions = (m: ConversationMember) => {
    const name = memberDisplayName(m);
    const isSelf = memberId != null && m.member_id === memberId;
    const buttons: {
      text: string;
      style?: 'cancel' | 'destructive' | 'default';
      onPress?: () => void;
    }[] = [
      {
        text: 'Профиль',
        onPress: () => navigation.navigate('Profile', { memberId: m.member_id }),
      },
    ];

    if (canManage && !isSelf && m.role === 'member') {
      buttons.push({
        text: 'Назначить администратором',
        onPress: () => roleMutation.mutate({ targetId: m.member_id, role: 'admin' }),
      });
    }

    if (canManage && !isSelf && m.role === 'admin') {
      buttons.push({
        text: 'Снять администратора',
        onPress: () => roleMutation.mutate({ targetId: m.member_id, role: 'member' }),
      });
    }

    if (
      canKick &&
      !isSelf &&
      m.role !== 'owner'
    ) {
      buttons.push({
        text: 'Исключить из группы',
        style: 'destructive',
        onPress: () => confirmKick(m),
      });
    }

    buttons.push({ text: 'Отмена', style: 'cancel' });
    Alert.alert(name, undefined, buttons);
  };

  if (isPrivate) {
    const profile = privateQuery.data;
    const fullName = profile
      ? [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() ||
        profile.name
      : displayTitle;
    const privateAvatar = resolvePublicUrl(
      profile?.avatar_url ?? conversation?.other_member?.avatar_url ?? null,
    );

    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <ChatAvatar name={fullName} imageUrl={privateAvatar} seed={String(profile?.id ?? conversationId)} size={88} />
          <Text style={styles.heroTitle}>{fullName}</Text>
          <Text style={styles.heroSub}>{typeLabel('private')}</Text>
        </View>

        <View style={styles.card}>
          <InfoRow label="Телефон" value={profile?.phone_number?.trim() || '—'} styles={styles} />
          <InfoRow label="Роль в проекте" value={profile?.app_role?.trim() || '—'} styles={styles} />
          <InfoRow label="Роль (служение)" value={profile?.ministry_role?.trim() || '—'} styles={styles} />
          <InfoRow
            label="Направление"
            value={profile?.ministry_direction?.trim() || '—'}
            styles={styles}
            last
          />
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="notifications-outline" size={20} color={colors.primary} />
            </View>
            <Text style={styles.rowLabel}>Уведомления</Text>
            <Switch
              value={!isMuted}
              onValueChange={(enabled) => muteMutation.mutate(!enabled)}
              disabled={muteMutation.isPending}
              trackColor={{ false: colors.textMuted, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {profile ? (
          <Pressable
            style={({ pressed }) => [styles.card, styles.profileLink, pressed && styles.pressed]}
            onPress={() => navigation.navigate('Profile', { memberId: profile.id })}
          >
            <Text style={styles.linkText}>Открыть профиль</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <ChatAvatar
            name={displayTitle}
            imageUrl={avatarUrl}
            seed={conversationId}
            size={88}
          />
          <Pressable
            onPress={canManage ? openRename : undefined}
            style={styles.heroTitleRow}
            disabled={!canManage}
          >
            <Text style={styles.heroTitle}>{displayTitle}</Text>
            {canManage ? (
              <Ionicons name="pencil" size={16} color={colors.textMuted} />
            ) : null}
          </Pressable>
          <Text style={styles.heroSub}>
            {typeLabel(meta?.type ?? conversation?.type)}
            {memberCount > 0 ? ` · ${memberCount} уч.` : ''}
          </Text>
        </View>

        {canManage ? (
          <>
            <Text style={styles.sectionLabel}>Приглашение</Text>
            <View style={styles.card}>
              <Pressable
                onPress={() => void copyInvite()}
                disabled={!inviteLink || inviteMutation.isPending}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.rowIcon}>
                  <Ionicons name="link-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.inviteTextCol}>
                  <Text style={styles.rowLabel}>Ссылка-приглашение</Text>
                  <Text style={styles.inviteUrl} numberOfLines={1}>
                    {inviteLink || (inviteMutation.isPending ? 'Создаём…' : 'Нет ссылки')}
                  </Text>
                </View>
                <Ionicons name="copy-outline" size={20} color={colors.textMuted} />
              </Pressable>
              <Pressable
                onPress={resetInvite}
                disabled={inviteMutation.isPending}
                style={({ pressed }) => [styles.resetInviteRow, pressed && styles.pressed]}
              >
                <Ionicons name="refresh-outline" size={18} color="#dc2626" />
                <Text style={styles.resetInviteText}>Сбросить ссылку</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {canManage && permDraft ? (
          <>
            <Text style={styles.sectionLabel}>Разрешения участников</Text>
            <View style={styles.card}>
              {PERMISSION_ROWS.map((row, index) => (
                <View
                  key={row.key}
                  style={[
                    styles.row,
                    index < PERMISSION_ROWS.length - 1 && styles.permRowBorder,
                  ]}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name={row.icon} size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <Switch
                    value={permDraft[row.key]}
                    onValueChange={(value) => {
                      const next = { ...permDraft, [row.key]: value };
                      setPermDraft(next);
                      permissionsMutation.mutate(next);
                    }}
                    disabled={permissionsMutation.isPending}
                    trackColor={{ false: colors.textMuted, true: colors.primary }}
                    thumbColor="#fff"
                  />
                </View>
              ))}
            </View>
            <Text style={styles.permHint}>
              Эти права действуют для обычных участников. Админы и создатель не ограничены.
            </Text>
          </>
        ) : null}

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="notifications-outline" size={20} color={colors.primary} />
            </View>
            <Text style={styles.rowLabel}>Уведомления</Text>
            <Switch
              value={!isMuted}
              onValueChange={(enabled) => muteMutation.mutate(!enabled)}
              disabled={muteMutation.isPending}
              trackColor={{ false: colors.textMuted, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>Участники</Text>
        <View style={styles.card}>
          {canAddUsers ? (
            <Pressable
              onPress={() => setAddMembersOpen(true)}
              style={({ pressed }) => [styles.addMemberRow, pressed && styles.pressed]}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="person-add-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.addMemberText}>Добавить участников</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
          {membersQuery.isError ? (
            <ErrorView
              message="Не удалось загрузить участников"
              onRetry={() => {
                void membersQuery.refetch();
              }}
            />
          ) : members.length === 0 ? (
            <Text style={styles.emptyMembers}>Пока никого нет</Text>
          ) : (
            members.map((item, index) => {
              const isSelf = memberId != null && item.member_id === memberId;
              const canActOn =
                canManage ||
                (canKick && item.role !== 'owner' && !isSelf);
              return (
                <MemberRow
                  key={String(item.member_id)}
                  member={item}
                  styles={styles}
                  colors={colors}
                  isLast={index === members.length - 1}
                  showActions={canActOn && !isSelf && item.role !== 'owner'}
                  onPress={() =>
                    navigation.navigate('Profile', { memberId: item.member_id })
                  }
                  onActions={() => openMemberActions(item)}
                />
              );
            })
          )}
        </View>

        <View style={styles.card}>
          <Pressable
            style={({ pressed }) => [styles.dangerRow, pressed && styles.pressed]}
            onPress={confirmLeave}
            disabled={leaveMutation.isPending}
          >
            <Ionicons name="exit-outline" size={20} color="#dc2626" />
            <Text style={styles.dangerText}>
              {leaveMutation.isPending ? 'Выходим…' : 'Покинуть группу'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Название группы</Text>
            <TextInput
              value={titleDraft}
              onChangeText={setTitleDraft}
              maxLength={120}
              placeholder="Название"
              placeholderTextColor={colors.textMuted}
              style={styles.modalInput}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setRenameOpen(false)}
                style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}
              >
                <Text style={styles.modalBtnSecondary}>Отмена</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const next = titleDraft.trim();
                  if (!next) {
                    Alert.alert('Укажите название');
                    return;
                  }
                  renameMutation.mutate(next);
                }}
                disabled={renameMutation.isPending}
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnPrimary,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.modalBtnPrimaryText}>
                  {renameMutation.isPending ? 'Сохранение…' : 'Сохранить'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <AddMembersSheet
        visible={addMembersOpen}
        existingMemberIds={members.map((m) => m.member_id)}
        currentMemberId={memberId}
        onClose={() => setAddMembersOpen(false)}
        onAdd={addMember}
      />
    </>
  );
}

function InfoRow({
  label,
  value,
  styles,
  last,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function MemberRow({
  member,
  styles,
  colors,
  isLast,
  showActions,
  onPress,
  onActions,
}: {
  member: ConversationMember;
  styles: ReturnType<typeof createStyles>;
  colors: ReturnType<typeof useTheme>['colors'];
  isLast: boolean;
  showActions?: boolean;
  onPress: () => void;
  onActions?: () => void;
}) {
  const name = memberDisplayName(member);
  const avatar = resolvePublicUrl(member.avatar_url ?? null);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={showActions ? onActions : undefined}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.memberRow,
        !isLast && styles.memberRowBorder,
        pressed && styles.pressed,
      ]}
    >
      <ChatAvatar
        name={name}
        imageUrl={avatar}
        seed={String(member.member_id)}
        size={40}
        showOnline
        isOnline={member.is_online === true}
      />
      <View style={styles.memberText}>
        <Text style={styles.memberName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.memberRole}>{roleLabel(member.role)}</Text>
      </View>
      {showActions ? (
        <Pressable
          onPress={onActions}
          hitSlop={10}
          style={({ pressed }) => [styles.kickBtn, pressed && styles.pressed]}
          accessibilityLabel="Действия с участником"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
        </Pressable>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(28,25,23,0.08)';
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: 16,
      paddingBottom: 40,
      gap: 12,
    },
    pad: {
      flex: 1,
      padding: 16,
      backgroundColor: colors.surface,
    },
    hero: {
      alignItems: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      paddingVertical: 24,
      paddingHorizontal: 16,
      gap: 8,
    },
    heroTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      maxWidth: '100%',
    },
    heroTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    heroSub: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      overflow: 'hidden',
    },
    sectionLabel: {
      marginTop: 4,
      marginLeft: 4,
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 12,
    },
    rowIcon: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(217,119,135,0.15)' : 'rgba(125,54,64,0.1)',
    },
    rowLabel: {
      flex: 1,
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
    },
    inviteTextCol: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    inviteUrl: {
      fontSize: 12,
      color: colors.textMuted,
    },
    resetInviteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: border,
    },
    resetInviteText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#dc2626',
    },
    permRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: border,
    },
    permHint: {
      fontSize: 12,
      color: colors.textMuted,
      paddingHorizontal: 8,
      marginTop: -4,
      lineHeight: 16,
    },
    infoRow: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 4,
    },
    infoRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: border,
    },
    infoLabel: {
      fontSize: 12,
      color: colors.textMuted,
    },
    infoValue: {
      fontSize: 15,
      color: colors.text,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 12,
    },
    memberRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: border,
    },
    memberText: {
      flex: 1,
      minWidth: 0,
    },
    memberName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    memberRole: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    emptyMembers: {
      padding: 16,
      color: colors.textMuted,
      textAlign: 'center',
    },
    addMemberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: border,
    },
    addMemberText: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: colors.primary,
    },
    kickBtn: {
      padding: 4,
    },
    dangerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    dangerText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#dc2626',
    },
    profileLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    linkText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.primary,
    },
    pressed: {
      opacity: 0.7,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: 24,
    },
    modalCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      padding: 20,
      gap: 12,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    modalInput: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.text,
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 4,
    },
    modalBtn: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
    },
    modalBtnPrimary: {
      backgroundColor: colors.primary,
    },
    modalBtnSecondary: {
      color: colors.textSecondary,
      fontWeight: '600',
    },
    modalBtnPrimaryText: {
      color: colors.textOnPrimary,
      fontWeight: '700',
    },
  });
}
