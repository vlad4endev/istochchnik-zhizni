import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  addReaction,
  deleteMessage,
  fetchConversations,
  fetchMessages,
  markConversationRead,
  removeReaction,
  sendMessage,
  type MessageWithSender,
} from '../api/messenger';
import { ChatInput } from '../components/messenger/ChatInput';
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
import { setActiveMessengerConversation } from '../lib/realtimeWs';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../stores/authStore';
import { useMessengerRealtimeStore } from '../stores/messengerRealtimeStore';
import { messengerTextProps } from '../theme/messenger';
import { useTheme } from '../theme';

type ChatRoute = RouteProp<RootStackParamList, 'ChatThread'>;

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

  const typingUsers = useMessengerRealtimeStore((s) => s.typingByConv[conversationId] ?? []);

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

  useEffect(() => {
    navigation.setOptions({ title: title || 'Чат' });
  }, [navigation, title]);

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
      <FlatList
        ref={listRef}
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
          return (
            <MessageBubble
              message={item}
              isOwn={isOwn}
              showSenderName={showSender}
              onLongPress={handleLongPress}
              onSwipeReply={handleSwipeReply}
            />
          );
        }}
      />

      <View style={{ paddingBottom: insets.bottom }}>
        <ReplyBar replyTo={replyTo} onCancel={() => setReplyTo(null)} />
        <ChatInput
          conversationId={conversationId}
          onSend={async (text) => {
            await sendMutation.mutateAsync(text);
          }}
          disabled={sendMutation.isPending}
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
  });
}
