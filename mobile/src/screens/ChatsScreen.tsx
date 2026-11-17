import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  fetchConversations,
  markConversationRead,
  patchMyConversationUi,
  type ConversationListItem,
} from '../api/messenger';
import { ChatActionsSheet } from '../components/messenger/ChatActionsSheet';
import { CreateMeetingSheet } from '../components/messenger/CreateMeetingSheet';
import { ChatAvatar } from '../components/messenger/ChatAvatar';
import { ChatFilterTabs } from '../components/messenger/ChatFilterTabs';
import { MessengerText, MessengerTimeText } from '../components/messenger/MessengerText';
import { SearchBar } from '../components/messenger/SearchBar';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { ScreenHeader } from '../components/ScreenHeader';
import {
  formatChatTime,
  getConversationAvatarUrl,
  getConversationTitle,
  lastMessagePreview,
} from '../lib/messengerUtils';
import {
  filterConversationsByTab,
  type ChatTab,
} from '../lib/messengerTabs';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../stores/authStore';
import { useMessengerRealtimeStore } from '../stores/messengerRealtimeStore';
import { androidRipple, messengerTextProps } from '../theme/messenger';
import { useTheme, type ThemeColors } from '../theme';

type ChatsNav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Chats'>,
  NativeStackNavigationProp<RootStackParamList>
>;

export function ChatsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<ChatsNav>();
  const memberId = useAuthStore((s) => s.memberId);
  const onlineMembers = useMessengerRealtimeStore((s) => s.onlineMembers);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ChatTab>('all');
  const queryClient = useQueryClient();
  const typingByConv = useMessengerRealtimeStore((s) => s.typingByConv);
  const [actionsFor, setActionsFor] = useState<ConversationListItem | null>(null);
  const [meeting, setMeeting] = useState<{ open: boolean; conv: ConversationListItem | null }>({
    open: false,
    conv: null,
  });

  const conversationsQuery = useQuery({
    queryKey: ['messenger', 'conversations'],
    queryFn: fetchConversations,
    refetchInterval: 60_000,
  });

  const conversations = conversationsQuery.data ?? [];

  const sorted = useMemo(() => {
    return [...conversations].sort((a, b) => {
      // Закреплённые чаты — всегда сверху, как в Telegram.
      if (Boolean(a.my_ui_pinned) !== Boolean(b.my_ui_pinned)) return a.my_ui_pinned ? -1 : 1;
      const ta = a.last_message?.created_at ?? a.updated_at;
      const tb = b.last_message?.created_at ?? b.updated_at;
      return new Date(tb).getTime() - new Date(ta).getTime();
    });
  }, [conversations]);

  const filteredChats = useMemo(() => {
    const byTab = filterConversationsByTab(sorted, activeTab);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter((c) => getConversationTitle(c).toLowerCase().includes(q));
  }, [sorted, activeTab, searchQuery]);

  const patchCached = useCallback(
    (id: string, patch: Partial<ConversationListItem>) => {
      queryClient.setQueryData<ConversationListItem[]>(['messenger', 'conversations'], (prev) =>
        (prev ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)),
      );
    },
    [queryClient],
  );

  const uiMutation = useMutation({
    mutationFn: ({
      conv,
      body,
    }: {
      conv: ConversationListItem;
      body: { muted?: boolean; uiPinned?: boolean };
    }) => patchMyConversationUi(conv.id, body),
    onMutate: ({ conv, body }) => {
      patchCached(conv.id, {
        ...(body.muted !== undefined ? { my_muted: body.muted } : {}),
        ...(body.uiPinned !== undefined ? { my_ui_pinned: body.uiPinned } : {}),
      });
    },
    onError: (_e, { conv }) => {
      // Откатываем оптимистичное изменение.
      patchCached(conv.id, { my_muted: conv.my_muted, my_ui_pinned: conv.my_ui_pinned });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['messenger', 'conversations'] }),
  });

  const markRead = useCallback(
    async (conv: ConversationListItem) => {
      if (!conv.last_message) return;
      patchCached(conv.id, { unread_count: 0 });
      try {
        await markConversationRead(conv.id, conv.last_message.id);
      } finally {
        void queryClient.invalidateQueries({ queryKey: ['messenger', 'conversations'] });
        void queryClient.invalidateQueries({ queryKey: ['messenger', 'unread'] });
      }
    },
    [patchCached, queryClient],
  );

  const openChat = (conv: ConversationListItem) => {
    navigation.navigate('ChatThread', {
      conversationId: conv.id,
      title: getConversationTitle(conv),
      isGroup: conv.type !== 'private',
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader
        title="Чаты"
        subtitle="Мессенджер церкви"
        right={
          <Pressable
            onPress={() => setMeeting({ open: true, conv: null })}
            accessibilityRole="button"
            accessibilityLabel="Создать групповой созвон"
            hitSlop={6}
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="videocam-outline" size={26} color={colors.textOnPrimary} />
          </Pressable>
        }
      />

      <View style={{ height: 8 }} />
      <SearchBar value={searchQuery} onChange={setSearchQuery} />
      <ChatFilterTabs
        activeTab={activeTab}
        onChange={setActiveTab}
        conversations={conversations}
      />

      {conversationsQuery.isLoading ? <LoadingView /> : null}
      {conversationsQuery.isError ? (
        <ErrorView
          message={
            conversationsQuery.error instanceof Error
              ? conversationsQuery.error.message
              : 'Ошибка загрузки'
          }
          onRetry={() => void conversationsQuery.refetch()}
        />
      ) : null}

      {!conversationsQuery.isLoading && !conversationsQuery.isError ? (
        <FlatList
          data={filteredChats}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={conversationsQuery.isRefetching}
              onRefresh={() => void conversationsQuery.refetch()}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={[
            filteredChats.length === 0 ? styles.emptyList : undefined,
            { paddingBottom: Math.max(insets.bottom, 8) },
          ]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color={colors.textMuted} />
              <Text {...messengerTextProps} style={styles.emptyTitle}>
                {searchQuery.trim() ? 'Ничего не найдено' : 'Пока нет чатов'}
              </Text>
              <Text {...messengerTextProps} style={styles.emptyBody}>
                {searchQuery.trim()
                  ? 'Попробуйте другой запрос'
                  : 'Начните переписку с членом церкви'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ChatRow
              conv={item}
              memberId={memberId}
              isOnline={
                item.type === 'private' && item.other_member != null
                  ? onlineMembers.has(item.other_member.id)
                  : false
              }
              typingLabel={(() => {
                const who = (typingByConv[item.id] ?? []).find((u) => u.memberId !== memberId);
                if (!who) return null;
                return item.type === 'private'
                  ? 'печатает…'
                  : `${who.memberName.split(' ')[0] || 'Кто-то'} печатает…`;
              })()}
              onPress={() => openChat(item)}
              onLongPress={() => setActionsFor(item)}
              colors={colors}
            />
          )}
        />
      ) : null}

      <Pressable
        onPress={() => navigation.navigate('NewChat')}
        accessibilityRole="button"
        accessibilityLabel="Новый чат"
        style={({ pressed }) => [
          styles.fab,
          { bottom: Math.max(insets.bottom, 12) + 12 },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Ionicons name="create-outline" size={26} color={colors.textOnPrimary} />
      </Pressable>

      <ChatActionsSheet
        conversation={actionsFor}
        onClose={() => setActionsFor(null)}
        onTogglePin={(c) => uiMutation.mutate({ conv: c, body: { uiPinned: !c.my_ui_pinned } })}
        onToggleMute={(c) => uiMutation.mutate({ conv: c, body: { muted: !c.my_muted } })}
        onMarkRead={(c) => void markRead(c)}
        onGroupCall={(c) => setMeeting({ open: true, conv: c })}
      />
      <CreateMeetingSheet
        visible={meeting.open}
        onClose={() => setMeeting({ open: false, conv: null })}
        conversationId={meeting.conv?.id}
        conversationTitle={meeting.conv ? getConversationTitle(meeting.conv) : undefined}
      />
    </SafeAreaView>
  );
}

function ChatRow({
  conv,
  memberId,
  isOnline,
  typingLabel,
  onPress,
  onLongPress,
  colors,
}: {
  conv: ConversationListItem;
  memberId: number | null;
  isOnline: boolean;
  typingLabel: string | null;
  onPress: () => void;
  onLongPress: () => void;
  colors: ThemeColors;
}) {
  const title = getConversationTitle(conv);
  const preview = lastMessagePreview(conv, memberId);
  const time = conv.last_message?.created_at ?? conv.updated_at;
  const unread = conv.unread_count > 0;
  const muted = conv.my_muted === true;
  const pinned = conv.my_ui_pinned === true;
  const showOnline = conv.type === 'private' && conv.other_member != null;
  const last = conv.last_message;
  const fromMe =
    last != null && last.sender_id != null && memberId != null && Number(last.sender_id) === memberId;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      android_ripple={androidRipple}
      accessibilityRole="button"
      accessibilityLabel={`${title}${unread ? `, непрочитанных: ${conv.unread_count}` : ''}`}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 10,
          minHeight: 72,
          backgroundColor: pressed
            ? `${colors.primary}10`
            : pinned
              ? `${colors.primary}08`
              : colors.surface,
        },
      ]}
    >
      <ChatAvatar
        name={title}
        imageUrl={getConversationAvatarUrl(conv)}
        seed={conv.id}
        size={54}
        showOnline={showOnline}
        isOnline={isOnline}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <MessengerText
            style={{ flexShrink: 1, fontSize: 17, fontWeight: '700', color: colors.text }}
            numberOfLines={1}
          >
            {title}
          </MessengerText>
          {muted ? (
            <Ionicons name="notifications-off" size={14} color={colors.textSecondary} />
          ) : null}
          <View style={{ flex: 1 }} />
          {fromMe && !last?.is_deleted ? (
            <Ionicons
              name={last?.read_by_others ? 'checkmark-done' : 'checkmark'}
              size={17}
              color={last?.read_by_others ? colors.primary : colors.textSecondary}
            />
          ) : null}
          <MessengerTimeText
            style={{
              fontSize: 13,
              color: unread && !muted ? colors.primary : colors.textSecondary,
            }}
          >
            {formatChatTime(time)}
          </MessengerTimeText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          {typingLabel ? (
            <MessengerText
              style={{ flex: 1, fontSize: 15, color: colors.primary, fontStyle: 'italic' }}
              numberOfLines={1}
            >
              {typingLabel}
            </MessengerText>
          ) : (
            <MessengerText
              style={{
                flex: 1,
                fontSize: 15,
                color: unread ? colors.text : colors.textSecondary,
                fontWeight: unread ? '600' : '400',
              }}
              numberOfLines={1}
            >
              {preview}
            </MessengerText>
          )}
          {unread ? (
            <View
              style={{
                minWidth: 24,
                height: 24,
                borderRadius: 12,
                paddingHorizontal: 7,
                backgroundColor: muted ? colors.textSecondary : colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MessengerTimeText
                style={{ fontSize: 12, fontWeight: '800', color: colors.textOnPrimary }}
              >
                {conv.unread_count > 99 ? '99+' : String(conv.unread_count)}
              </MessengerTimeText>
            </View>
          ) : pinned ? (
            <Ionicons name="pin" size={16} color={colors.textSecondary} />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    headerBtn: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fab: {
      position: 'absolute',
      right: 16,
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 6,
    },
    emptyList: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    empty: {
      alignItems: 'center',
      padding: 32,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginTop: 8,
    },
    emptyBody: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
}
