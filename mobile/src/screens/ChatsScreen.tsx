import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchConversations, type ConversationListItem } from '../api/messenger';
import { ChatAvatar } from '../components/messenger/ChatAvatar';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { ScreenHeader } from '../components/ScreenHeader';
import {
  formatChatTime,
  getConversationAvatarUrl,
  getConversationTitle,
  lastMessagePreview,
} from '../lib/messengerUtils';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../stores/authStore';
import { useTheme, type ThemeColors } from '../theme';

type ChatsNav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Chats'>,
  NativeStackNavigationProp<RootStackParamList>
>;

export function ChatsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<ChatsNav>();
  const memberId = useAuthStore((s) => s.memberId);

  const conversationsQuery = useQuery({
    queryKey: ['messenger', 'conversations'],
    queryFn: fetchConversations,
    refetchInterval: 60_000,
  });

  const conversations = conversationsQuery.data ?? [];

  const sorted = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const ta = a.last_message?.created_at ?? a.updated_at;
      const tb = b.last_message?.created_at ?? b.updated_at;
      return new Date(tb).getTime() - new Date(ta).getTime();
    });
  }, [conversations]);

  const openChat = (conv: ConversationListItem) => {
    navigation.navigate('ChatThread', {
      conversationId: conv.id,
      title: getConversationTitle(conv),
      isGroup: conv.type !== 'private',
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Чаты" subtitle="Мессенджер церкви" />

      <View style={styles.toolbar}>
        <Pressable
          onPress={() => navigation.navigate('NewChat')}
          style={({ pressed }) => [styles.newBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="create-outline" size={20} color={colors.textOnPrimary} />
          <Text style={styles.newBtnText}>Новый чат</Text>
        </Pressable>
      </View>

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
          data={sorted}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={conversationsQuery.isRefetching}
              onRefresh={() => void conversationsQuery.refetch()}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={sorted.length === 0 ? styles.emptyList : undefined}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>Пока нет чатов</Text>
              <Text style={styles.emptyBody}>Начните переписку с членом церкви</Text>
            </View>
          }
          renderItem={({ item }) => (
            <ChatRow
              conv={item}
              memberId={memberId}
              onPress={() => openChat(item)}
              colors={colors}
            />
          )}
        />
      ) : null}
    </SafeAreaView>
  );
}

function ChatRow({
  conv,
  memberId,
  onPress,
  colors,
}: {
  conv: ConversationListItem;
  memberId: number | null;
  onPress: () => void;
  colors: ThemeColors;
}) {
  const title = getConversationTitle(conv);
  const preview = lastMessagePreview(conv, memberId);
  const time = conv.last_message?.created_at ?? conv.updated_at;
  const unread = conv.unread_count > 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: pressed ? `${colors.primary}08` : colors.surface,
        },
      ]}
    >
      <ChatAvatar
        name={title}
        imageUrl={getConversationAvatarUrl(conv)}
        seed={conv.id}
        size={52}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: colors.text }} numberOfLines={1}>
            {title}
          </Text>
          <Text style={{ fontSize: 12, color: colors.textMuted }}>{formatChatTime(time)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Text
            style={{
              flex: 1,
              fontSize: 14,
              color: unread ? colors.text : colors.textSecondary,
              fontWeight: unread ? '600' : '400',
            }}
            numberOfLines={1}
          >
            {preview}
          </Text>
          {unread ? (
            <View
              style={{
                minWidth: 22,
                height: 22,
                borderRadius: 11,
                paddingHorizontal: 6,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textOnPrimary }}>
                {conv.unread_count > 99 ? '99+' : conv.unread_count}
              </Text>
            </View>
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
    toolbar: {
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    newBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 12,
    },
    newBtnText: {
      color: colors.textOnPrimary,
      fontSize: 15,
      fontWeight: '700',
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
      color: colors.textMuted,
      textAlign: 'center',
    },
  });
}
