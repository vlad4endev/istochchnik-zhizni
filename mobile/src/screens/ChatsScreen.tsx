import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchConversations, type ConversationListItem } from '../api/messenger';
import { ChatAvatar } from '../components/messenger/ChatAvatar';
import { ChatFilterTabs } from '../components/messenger/ChatFilterTabs';
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

  const filteredChats = useMemo(() => {
    const byTab = filterConversationsByTab(sorted, activeTab);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter((c) => getConversationTitle(c).toLowerCase().includes(q));
  }, [sorted, activeTab, searchQuery]);

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
          android_ripple={androidRipple}
          style={({ pressed }) => [styles.newBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="create-outline" size={20} color={colors.textOnPrimary} />
          <Text {...messengerTextProps} style={styles.newBtnText}>
            Новый чат
          </Text>
        </Pressable>
      </View>

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
  isOnline,
  onPress,
  colors,
}: {
  conv: ConversationListItem;
  memberId: number | null;
  isOnline: boolean;
  onPress: () => void;
  colors: ThemeColors;
}) {
  const title = getConversationTitle(conv);
  const preview = lastMessagePreview(conv, memberId);
  const time = conv.last_message?.created_at ?? conv.updated_at;
  const unread = conv.unread_count > 0;
  const showOnline = conv.type === 'private' && conv.other_member != null;

  return (
    <Pressable
      onPress={onPress}
      android_ripple={androidRipple}
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
        showOnline={showOnline}
        isOnline={isOnline}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text
            {...messengerTextProps}
            style={{ flex: 1, fontSize: 16, fontWeight: '700', color: colors.text }}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text {...messengerTextProps} style={{ fontSize: 12, color: colors.textMuted }}>
            {formatChatTime(time)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Text
            {...messengerTextProps}
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
              <Text
                {...messengerTextProps}
                style={{ fontSize: 11, fontWeight: '800', color: colors.textOnPrimary }}
              >
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
