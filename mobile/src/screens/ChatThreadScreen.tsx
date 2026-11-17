import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  addReaction,
  deleteMessage,
  editMessage,
  fetchConversations,
  fetchMessages,
  fetchParticipantsCount,
  fetchPinnedMessages,
  markConversationRead,
  pinChatMessage,
  removeReaction,
  sendMessage,
  unpinChatMessage,
  type MessageWithSender,
} from '../api/messenger';
import { sendAttachments, sendVoiceMessage } from '../api/messengerUpload';
import { ForwardSheet } from '../components/messenger/ForwardSheet';
import { ReadersSheet } from '../components/messenger/ReadersSheet';
import { isReadByOthers, readUpTo } from '../lib/readReceipts';
import { ChatHeaderTitle } from '../components/messenger/ChatHeaderTitle';
import { ChatInput } from '../components/messenger/ChatInput';
import { CreateMeetingSheet } from '../components/messenger/CreateMeetingSheet';
import { MessageBubble } from '../components/messenger/MessageBubble';
import { MessageContextMenu } from '../components/messenger/MessageContextMenu';
import { ReplyBar } from '../components/messenger/ReplyBar';
import { TypingIndicator } from '../components/messenger/TypingIndicator';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import {
  createClientMsgId,
  getConversationAvatarUrl,
  getConversationTitle,
  sortMessagesChronological,
} from '../lib/messengerUtils';
import { formatLastSeen, membersWord } from '../lib/lastSeen';
import { setActiveMessengerConversation } from '../lib/realtimeWs';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../stores/authStore';
import { useMessengerRealtimeStore } from '../stores/messengerRealtimeStore';
import { messengerTextProps } from '../theme/messenger';
import { useTheme } from '../theme';

type ChatRoute = RouteProp<RootStackParamList, 'ChatThread'>;

function dayChipLabel(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return 'Сегодня';
  if (isYesterday(d)) return 'Вчера';
  return format(d, d.getFullYear() === new Date().getFullYear() ? 'd MMMM' : 'd MMMM yyyy', {
    locale: ru,
  });
}

export function ChatThreadScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<ChatRoute>();
  const { conversationId, title, isGroup = false } = route.params;
  const memberId = useAuthStore((s) => s.memberId);
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList<MessageWithSender>>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [optimistic, setOptimistic] = useState<MessageWithSender[]>([]);
  const [replyTo, setReplyTo] = useState<MessageWithSender | null>(null);
  const [menuMessage, setMenuMessage] = useState<{
    message: MessageWithSender;
    isOwn: boolean;
  } | null>(null);

  const [editing, setEditing] = useState<MessageWithSender | null>(null);
  const [editToken, setEditToken] = useState(0);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [forwardId, setForwardId] = useState<string | null>(null);
  const [readersId, setReadersId] = useState<string | null>(null);
  const readCursors = useMessengerRealtimeStore((s) => s.readCursorsByConv[conversationId]);
  const [showJump, setShowJump] = useState(false);
  const typingUsers = useMessengerRealtimeStore((s) => s.typingByConv[conversationId] ?? []);
  const onlineMembers = useMessengerRealtimeStore((s) => s.onlineMembers);
  const memberLastSeenAt = useMessengerRealtimeStore((s) => s.memberLastSeenAt);

  const conversationsQuery = useQuery({
    queryKey: ['messenger', 'conversations'],
    queryFn: fetchConversations,
    staleTime: 30_000,
  });

  const conversation = useMemo(
    () => conversationsQuery.data?.find((c) => c.id === conversationId) ?? null,
    [conversationsQuery.data, conversationId],
  );

  const typingUser = useMemo(() => {
    return typingUsers.find((u) => u.memberId !== memberId) ?? null;
  }, [typingUsers, memberId]);

  const participantsQuery = useQuery({
    queryKey: ['messenger', 'participants-count', conversationId],
    queryFn: () => fetchParticipantsCount(conversationId),
    enabled: isGroup,
    staleTime: 5 * 60_000,
  });

  const pinnedQuery = useQuery({
    queryKey: ['messenger', 'pinned', conversationId],
    queryFn: () => fetchPinnedMessages(conversationId, 15),
    staleTime: 30_000,
  });
  const pinnedMessages = pinnedQuery.data ?? [];
  const pinnedIds = useMemo(() => new Set(pinnedMessages.map((m) => m.id)), [pinnedMessages]);

  const headerInfo = useMemo(() => {
    const other = conversation?.other_member ?? null;
    const typing = typingUsers.find((u) => u.memberId !== memberId) ?? null;
    if (typing) {
      return {
        subtitle: isGroup ? `${typing.memberName.split(' ')[0]} печатает…` : 'печатает…',
        accent: true,
      };
    }
    if (isGroup) {
      const n = participantsQuery.data;
      return { subtitle: n ? membersWord(n) : 'Групповой чат', accent: false };
    }
    if (other) {
      if (onlineMembers.has(other.id)) return { subtitle: 'в сети', accent: true };
      return {
        subtitle: formatLastSeen(memberLastSeenAt[other.id] ?? other.last_seen_at ?? null),
        accent: false,
      };
    }
    return { subtitle: '', accent: false };
  }, [
    conversation?.other_member,
    isGroup,
    memberId,
    memberLastSeenAt,
    onlineMembers,
    participantsQuery.data,
    typingUsers,
  ]);

  const upTo = useMemo(
    () =>
      readUpTo({ cursors: readCursors, myMemberId: memberId, lastMessage: conversation?.last_message }),
    [readCursors, memberId, conversation?.last_message],
  );

  const headerOnline =
    !isGroup && conversation?.other_member != null && onlineMembers.has(conversation.other_member.id);
  const headerTitleText = conversation ? getConversationTitle(conversation) : title || 'Чат';
  const headerAvatar = conversation ? getConversationAvatarUrl(conversation) : null;

  useEffect(() => {
    navigation.setOptions({
      title: headerTitleText,
      headerTitle: () => (
        <ChatHeaderTitle
          title={headerTitleText}
          subtitle={headerInfo.subtitle}
          accent={headerInfo.accent}
          avatarUrl={headerAvatar}
          avatarSeed={conversationId}
          isOnline={headerOnline}
          showOnline={!isGroup && conversation?.other_member != null}
          textColor={colors.text}
          subtitleColor={colors.textSecondary}
          accentColor={colors.primary}
        />
      ),
      headerRight: () => (
        <Pressable
          onPress={() => setMeetingOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Созвон в этом чате"
          hitSlop={8}
          style={({ pressed }) => [{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="videocam-outline" size={26} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [
    navigation,
    headerTitleText,
    headerInfo,
    headerAvatar,
    headerOnline,
    conversationId,
    isGroup,
    conversation?.other_member,
    colors.text,
    colors.textSecondary,
    colors.primary,
  ]);

  useEffect(() => {
    setActiveMessengerConversation(conversationId);
    return () => {
      setActiveMessengerConversation(null);
    };
  }, [conversationId]);

  const messagesQuery = useQuery({
    queryKey: ['messenger', 'messages', conversationId],
    queryFn: () => fetchMessages(conversationId, { limit: 50 }),
  });

  const serverMessages = messagesQuery.data ?? [];

  const mergedMessages = useMemo(() => {
    const map = new Map<string, MessageWithSender>();
    for (const m of serverMessages) {
      map.set(m.id, m);
    }
    for (const m of optimistic) {
      const key = m.client_msg_id ?? m.id;
      const existing = [...map.values()].find((x) => x.client_msg_id === key);
      if (!existing) {
        map.set(m.id, m);
      }
    }
    return sortMessagesChronological([...map.values()]);
  }, [serverMessages, optimistic]);

  const displayMessages = useMemo(
    () => [...mergedMessages].reverse(),
    [mergedMessages],
  );

  useEffect(() => {
    const latest = mergedMessages[mergedMessages.length - 1];
    if (!latest || latest.status === 'sending' || latest.status === 'error') return;
    void markConversationRead(conversationId, latest.id).then(() => {
      void queryClient.invalidateQueries({ queryKey: ['messenger', 'conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['messenger', 'unread'] });
    });
  }, [conversationId, mergedMessages, queryClient]);

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const clientMsgId = createClientMsgId();
      const replyId = replyTo?.id ?? null;
      const optimisticMsg: MessageWithSender = {
        id: clientMsgId,
        conversation_id: conversationId,
        sender_id: memberId,
        client_msg_id: clientMsgId,
        content,
        payload_type: 'text',
        reply_to_message_id: replyId,
        is_edited: false,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sender_name: null,
        sender_first_name: null,
        sender_last_name: null,
        reply_preview: replyTo
          ? {
              id: replyTo.id,
              content: replyTo.content,
              sender_name: replyTo.sender_name,
              is_deleted: replyTo.is_deleted,
            }
          : null,
        reactions: [],
        status: 'sending',
      };
      setOptimistic((prev) => [...prev, optimisticMsg]);

      try {
        const saved = await sendMessage(conversationId, content, clientMsgId, replyId);
        setOptimistic((prev) => prev.filter((m) => m.client_msg_id !== clientMsgId));
        setReplyTo(null);
        await queryClient.invalidateQueries({ queryKey: ['messenger', 'messages', conversationId] });
        await queryClient.invalidateQueries({ queryKey: ['messenger', 'conversations'] });
        return saved;
      } catch (e) {
        setOptimistic((prev) =>
          prev.map((m) => (m.client_msg_id === clientMsgId ? { ...m, status: 'error' } : m)),
        );
        throw e;
      }
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => editMessage(id, text),
    onSuccess: () => {
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['messenger', 'messages', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['messenger', 'conversations'] });
    },
  });

  const pinMutation = useMutation({
    mutationFn: async (message: MessageWithSender) => {
      if (pinnedIds.has(message.id)) await unpinChatMessage(conversationId, message.id);
      else await pinChatMessage(conversationId, message.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['messenger', 'pinned', conversationId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMessage,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['messenger', 'messages', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['messenger', 'conversations'] });
    },
  });

  const reactMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      const msg = mergedMessages.find((m) => m.id === messageId);
      const existing = msg?.reactions.find((r) => r.emoji === emoji);
      if (existing?.reacted_by_me) {
        await removeReaction(messageId, emoji);
      } else {
        await addReaction(messageId, emoji);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['messenger', 'messages', conversationId] });
    },
  });

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || mergedMessages.length === 0) return;
    const oldest = mergedMessages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const older = await fetchMessages(conversationId, { beforeId: oldest.id, limit: 50 });
      if (older.length === 0) {
        setHasMore(false);
        return;
      }
      queryClient.setQueryData<MessageWithSender[]>(
        ['messenger', 'messages', conversationId],
        (prev) => {
          const existing = prev ?? [];
          const ids = new Set(existing.map((m) => m.id));
          const merged = [...older.filter((m) => !ids.has(m.id)), ...existing];
          return sortMessagesChronological(merged);
        },
      );
      if (older.length < 50) setHasMore(false);
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, hasMore, loadingOlder, mergedMessages, queryClient]);

  const refreshAfterSend = useCallback(async () => {
    setReplyTo(null);
    await queryClient.invalidateQueries({ queryKey: ['messenger', 'messages', conversationId] });
    await queryClient.invalidateQueries({ queryKey: ['messenger', 'conversations'] });
  }, [conversationId, queryClient]);

  const handleSendAttachments = useCallback(
    async (
      items: Parameters<typeof sendAttachments>[0]['items'],
      caption: string,
      onProgress: (pct: number) => void,
    ) => {
      await sendAttachments({
        conversationId,
        items,
        caption,
        replyToMessageId: replyTo?.id ?? null,
        onProgress,
      });
      await refreshAfterSend();
    },
    [conversationId, refreshAfterSend, replyTo?.id],
  );

  const handleSendVoice = useCallback(
    async (file: Parameters<typeof sendVoiceMessage>[0]['file'], durationSec: number) => {
      await sendVoiceMessage({
        conversationId,
        file,
        durationSec,
        replyToMessageId: replyTo?.id ?? null,
      });
      await refreshAfterSend();
    },
    [conversationId, refreshAfterSend, replyTo?.id],
  );

  const handleLongPress = useCallback(
    (message: MessageWithSender) => {
      const isOwn = message.sender_id != null && memberId != null && message.sender_id === memberId;
      setMenuMessage({ message, isOwn });
    },
    [memberId],
  );

  const handleSwipeReply = useCallback((message: MessageWithSender) => {
    setReplyTo(message);
  }, []);

  const convTitle = conversation ? getConversationTitle(conversation) : title || 'Чат';
  const convAvatarUrl = conversation ? getConversationAvatarUrl(conversation) : null;

  const typingAvatarName = typingUser?.memberName ?? convTitle;
  const typingAvatarSeed = typingUser ? String(typingUser.memberId) : conversationId;

  if (messagesQuery.isLoading) {
    return (
      <View style={styles.safe}>
        <LoadingView />
      </View>
    );
  }

  if (messagesQuery.isError) {
    return (
      <View style={styles.safe}>
        <ErrorView
          message={
            messagesQuery.error instanceof Error ? messagesQuery.error.message : 'Ошибка'
          }
          onRetry={() => void messagesQuery.refetch()}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.safe}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {pinnedMessages.length > 0 ? (
        <View style={styles.pinBar} accessibilityLabel="Закреплённое сообщение">
          <Ionicons name="pin" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.pinLabel}>Закреплённое сообщение</Text>
            <Text style={styles.pinText} numberOfLines={1}>
              {String(pinnedMessages[0]!.content ?? '').trim() || 'Вложение'}
            </Text>
          </View>
        </View>
      ) : null}
      <FlatList
        ref={listRef}
        onScroll={(e) => setShowJump(e.nativeEvent.contentOffset.y > 400)}
        scrollEventThrottle={100}
        data={displayMessages}
        keyExtractor={(item) => item.client_msg_id ?? item.id}
        inverted
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={displayMessages.length === 0 ? styles.emptyList : styles.list}
        onEndReached={() => void loadOlder()}
        onEndReachedThreshold={0.2}
        ListHeaderComponent={
          typingUser ? (
            <TypingIndicator
              typingUser={typingUser}
              avatarName={typingAvatarName}
              avatarSeed={typingAvatarSeed}
              avatarUrl={!isGroup ? convAvatarUrl : null}
            />
          ) : null
        }
        ListFooterComponent={
          loadingOlder ? (
            <View style={styles.loader}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text {...messengerTextProps} style={styles.emptyText}>
              Напишите первое сообщение
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const isOwn = item.sender_id != null && memberId != null && item.sender_id === memberId;
          const prev = displayMessages[index + 1];
          const showSender =
            isGroup &&
            !isOwn &&
            (prev == null || prev.sender_id !== item.sender_id);
          const showDay = prev == null || !isSameDay(new Date(prev.created_at), new Date(item.created_at));
          return (
            <View>
              {showDay ? (
                <View style={styles.dayChipWrap}>
                  <Text style={styles.dayChip}>{dayChipLabel(item.created_at)}</Text>
                </View>
              ) : null}
              <MessageBubble
                message={item}
                isOwn={isOwn}
                showSenderName={showSender}
                onLongPress={handleLongPress}
                onSwipeReply={handleSwipeReply}
                readByOthers={isOwn && isReadByOthers(item.id, upTo)}
                onShowReaders={isGroup && isOwn ? (m) => setReadersId(m.id) : undefined}
              />
            </View>
          );
        }}
      />

      <View style={{ paddingBottom: insets.bottom }}>
        <ReplyBar replyTo={replyTo} onCancel={() => setReplyTo(null)} />
        {editing ? (
          <View style={styles.editBar}>
            <Ionicons name="pencil" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pinLabel}>Редактирование</Text>
              <Text style={styles.pinText} numberOfLines={1}>
                {String(editing.content ?? '')}
              </Text>
            </View>
            <Pressable
              onPress={() => setEditing(null)}
              accessibilityRole="button"
              accessibilityLabel="Отменить правку"
              style={styles.editClose}
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : null}
        <ChatInput
          conversationId={conversationId}
          onSendAttachments={handleSendAttachments}
          onSendVoice={handleSendVoice}
          prefill={editing ? { token: editToken, text: String(editing.content ?? '') } : null}
          onSend={async (text) => {
            if (editing) {
              await editMutation.mutateAsync({ id: editing.id, text });
              return;
            }
            await sendMutation.mutateAsync(text);
          }}
          disabled={sendMutation.isPending || editMutation.isPending}
        />
      </View>

      <MessageContextMenu
        visible={menuMessage != null}
        message={menuMessage?.message ?? null}
        isOwn={menuMessage?.isOwn ?? false}
        onClose={() => setMenuMessage(null)}
        onReply={(message) => setReplyTo(message)}
        onReact={(messageId, emoji) => {
          void reactMutation.mutateAsync({ messageId, emoji });
        }}
        onDelete={(messageId) => {
          void deleteMutation.mutateAsync(messageId);
        }}
        onEdit={(message) => {
          setReplyTo(null);
          setEditing(message);
          setEditToken((t) => t + 1);
        }}
        onPin={(message) => pinMutation.mutate(message)}
        onForward={(message) => setForwardId(message.id)}
        onShowReaders={isGroup ? (message) => setReadersId(message.id) : undefined}
        isPinned={menuMessage ? pinnedIds.has(menuMessage.message.id) : false}
      />

      {showJump ? (
        <Pressable
          onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
          accessibilityRole="button"
          accessibilityLabel="К последним сообщениям"
          style={[styles.jump, { bottom: insets.bottom + 84 }]}
        >
          <Ionicons name="chevron-down" size={26} color={colors.primary} />
        </Pressable>
      ) : null}

      <ForwardSheet
        messageId={forwardId}
        sourceConversationId={conversationId}
        onClose={() => setForwardId(null)}
        onForwarded={(n) =>
          Alert.alert(n === 1 ? 'Сообщение переслано' : `Переслано в чатов: ${n}`)
        }
      />
      <ReadersSheet messageId={readersId} onClose={() => setReadersId(null)} />

      <CreateMeetingSheet
        visible={meetingOpen}
        onClose={() => setMeetingOpen(false)}
        conversationId={conversationId}
        conversationTitle={headerTitleText}
      />
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    list: {
      paddingVertical: 8,
    },
    emptyList: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    empty: {
      alignItems: 'center',
      padding: 24,
      transform: [{ scaleY: -1 }],
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 15,
    },
    loader: {
      paddingVertical: 12,
      transform: [{ scaleY: -1 }],
    },
    dayChipWrap: { alignItems: 'center', paddingVertical: 8 },
    dayChip: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
      overflow: 'hidden',
    },
    pinBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.surfaceElevated,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.textMuted + '66',
    },
    pinLabel: { fontSize: 13, fontWeight: '800', color: colors.primary },
    pinText: { fontSize: 15, color: colors.textSecondary },
    editBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.surfaceElevated,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.textMuted + '66',
    },
    editClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    jump: {
      position: 'absolute',
      right: 16,
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 5,
    },
  });
}
