import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  authorDisplayName,
  createStory,
  deleteFeedPost,
  fetchChurchFeed,
  fetchStories,
  likeFeedPost,
  markFeedSeen,
  repostFeedPost,
  unlikeFeedPost,
  type FeedPost,
  type StoryAuthorGroup,
} from '../api/feed';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { ScreenHeader } from '../components/ScreenHeader';
import { resolvePublicUrl } from '../lib/resolvePublicUrl';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../stores/authStore';
import { useTheme, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function FeedScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const qc = useQueryClient();
  const memberId = useAuthStore((s) => s.memberId);
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles);
  const isAdmin =
    role === 'admin' || roles.some((r) => String(r).toLowerCase() === 'admin');
  const [cursor, setCursor] = useState<string | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);

  const feedQuery = useQuery({
    queryKey: ['feed', 'page', cursor],
    queryFn: () => fetchChurchFeed({ cursor, limit: 20 }),
  });

  const storiesQuery = useQuery({
    queryKey: ['stories'],
    queryFn: fetchStories,
  });

  useEffect(() => {
    if (!feedQuery.data) return;
    setPosts((prev) => {
      if (!cursor) return feedQuery.data.posts;
      const ids = new Set(prev.map((p) => p.id));
      return [...prev, ...feedQuery.data.posts.filter((p) => !ids.has(p.id))];
    });
    const newest = feedQuery.data.posts[0]?.created_at;
    if (newest && !cursor) {
      void markFeedSeen(newest);
    }
  }, [feedQuery.data, cursor]);

  const likeMutation = useMutation({
    mutationFn: async (post: FeedPost) => {
      if (post.liked_by_me) await unlikeFeedPost(post.id);
      else await likeFeedPost(post.id);
    },
    onMutate: async (post) => {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? {
                ...p,
                liked_by_me: !p.liked_by_me,
                like_count: Math.max(0, p.like_count + (p.liked_by_me ? -1 : 1)),
              }
            : p,
        ),
      );
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  const repostMutation = useMutation({
    mutationFn: (post: FeedPost) => repostFeedPost(post.id),
    onMutate: async (post) => {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? {
                ...p,
                reposted_by_me: true,
                repost_count: p.repost_count + 1,
              }
            : p,
        ),
      );
    },
    onSuccess: () => {
      setCursor(null);
      void qc.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: ['feed'] });
      Alert.alert('Ошибка', String(e));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (postId: string) => deleteFeedPost(postId),
    onSuccess: (_data, postId) => {
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (e) => Alert.alert('Ошибка', String(e)),
  });

  const confirmDelete = (post: FeedPost) => {
    Alert.alert('Удалить публикацию?', 'Это действие нельзя отменить', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(post.id),
      },
    ]);
  };

  const openPostMenu = (post: FeedPost) => {
    const canDelete = isAdmin || (memberId != null && post.member_id === memberId);
    const buttons: Array<{
      text: string;
      style?: 'cancel' | 'destructive' | 'default';
      onPress?: () => void;
    }> = [];
    if (!post.reposted_by_me) {
      buttons.push({
        text: 'Репост',
        onPress: () => repostMutation.mutate(post),
      });
    }
    if (canDelete) {
      buttons.push({
        text: 'Удалить',
        style: 'destructive',
        onPress: () => confirmDelete(post),
      });
    }
    buttons.push({ text: 'Отмена', style: 'cancel' });
    Alert.alert('Публикация', undefined, buttons);
  };

  const storyMutation = useMutation({
    mutationFn: async () => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) throw new Error('Нет доступа к галерее');
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.85,
      });
      if (picked.canceled || !picked.assets[0]) return;
      const a = picked.assets[0];
      await createStory({
        asset: {
          uri: a.uri,
          name: a.fileName ?? `story-${Date.now()}.jpg`,
          type: a.mimeType ?? (a.type === 'video' ? 'video/mp4' : 'image/jpeg'),
        },
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stories'] });
    },
    onError: (e) => Alert.alert('Ошибка', String(e)),
  });

  const onRefresh = () => {
    setCursor(null);
    setPosts([]);
    void feedQuery.refetch();
    void storiesQuery.refetch();
  };

  if (feedQuery.isLoading && posts.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Лента" subtitle="Новости церкви" />
        <LoadingView />
      </SafeAreaView>
    );
  }

  if (feedQuery.isError && posts.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Лента" subtitle="Новости церкви" />
        <ErrorView message={String(feedQuery.error)} onRetry={onRefresh} />
      </SafeAreaView>
    );
  }

  const groups = storiesQuery.data ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader
        title="Лента"
        subtitle="Новости церкви"
        right={
          <Pressable
            onPress={() => navigation.navigate('ComposePost')}
            hitSlop={10}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name="add-circle-outline" size={28} color={colors.primary} />
          </Pressable>
        }
      />
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={feedQuery.isFetching && !cursor} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <StoriesRow
            groups={groups}
            colors={colors}
            onAdd={() => storyMutation.mutate()}
            onOpen={(index) =>
              navigation.navigate('StoryViewer', { groupIndex: index, groups })
            }
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="images-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Пока нет записей</Text>
          </View>
        }
        onEndReached={() => {
          const next = feedQuery.data?.next_cursor;
          if (next && !feedQuery.isFetching) setCursor(next);
        }}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable
              onPress={() => {
                if (item.author.username) {
                  navigation.navigate('Profile', { username: item.author.username });
                } else if (item.author.member_id) {
                  navigation.navigate('Profile', { memberId: item.author.member_id });
                }
              }}
              style={styles.authorRow}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(authorDisplayName(item.author)[0] ?? '?').toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.authorName}>{authorDisplayName(item.author)}</Text>
                <Text style={styles.meta}>
                  {item.created_at
                    ? format(parseISO(item.created_at), 'd MMM, HH:mm', { locale: ru })
                    : ''}
                </Text>
              </View>
            </Pressable>
            {item.caption ? <Text style={styles.caption}>{item.caption}</Text> : null}
            {(() => {
              const mediaUrl = resolvePublicUrl(item.media[0]?.url);
              if (!mediaUrl) return null;
              return (
                <Image source={{ uri: mediaUrl }} style={styles.media} contentFit="cover" />
              );
            })()}
            <View style={styles.actions}>
              <Pressable
                onPress={() => likeMutation.mutate(item)}
                style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons
                  name={item.liked_by_me ? 'heart' : 'heart-outline'}
                  size={20}
                  color={item.liked_by_me ? colors.primary : colors.textMuted}
                />
                <Text style={styles.actionText}>{item.like_count}</Text>
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate('FeedPostComments', { postId: item.id })}
                style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted} />
                <Text style={styles.actionText}>{item.comment_count}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (item.reposted_by_me) return;
                  repostMutation.mutate(item);
                }}
                disabled={item.reposted_by_me || repostMutation.isPending}
                style={({ pressed }) => [
                  styles.actionBtn,
                  pressed && { opacity: 0.7 },
                  item.reposted_by_me && { opacity: 0.45 },
                ]}
              >
                <Ionicons
                  name={item.reposted_by_me ? 'repeat' : 'repeat-outline'}
                  size={20}
                  color={item.reposted_by_me ? colors.primary : colors.textMuted}
                />
                <Text style={styles.actionText}>{item.repost_count}</Text>
              </Pressable>
              <Pressable
                onPress={() => openPostMenu(item)}
                style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function StoriesRow({
  groups,
  colors,
  onAdd,
  onOpen,
}: {
  groups: StoryAuthorGroup[];
  colors: ThemeColors;
  onAdd: () => void;
  onOpen: (index: number) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 12, gap: 10 }}
    >
      <Pressable onPress={onAdd} style={{ alignItems: 'center', width: 72 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            borderWidth: 2,
            borderColor: colors.primary,
            borderStyle: 'dashed',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceElevated,
          }}
        >
          <Ionicons name="add" size={28} color={colors.primary} />
        </View>
        <Text
          style={{ fontSize: 11, color: colors.textMuted, marginTop: 6, fontWeight: '600' }}
          numberOfLines={1}
        >
          История
        </Text>
      </Pressable>
      {groups.map((g, index) => (
        <Pressable
          key={`${g.author.member_id}-${index}`}
          onPress={() => onOpen(index)}
          style={{ alignItems: 'center', width: 72 }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              borderWidth: 2.5,
              borderColor: g.all_seen ? colors.textMuted : colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.primary,
            }}
          >
            <Text style={{ color: colors.textOnPrimary, fontWeight: '800', fontSize: 20 }}>
              {(authorDisplayName(g.author)[0] ?? '?').toUpperCase()}
            </Text>
          </View>
          <Text
            style={{ fontSize: 11, color: colors.text, marginTop: 6, fontWeight: '600' }}
            numberOfLines={1}
          >
            {g.is_me ? 'Вы' : authorDisplayName(g.author)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    list: { padding: 16, paddingBottom: 40 },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      padding: 14,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.06)',
      marginBottom: 12,
    },
    authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: colors.textOnPrimary, fontWeight: '800' },
    authorName: { fontSize: 15, fontWeight: '700', color: colors.text },
    meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    caption: { fontSize: 15, color: colors.text, lineHeight: 22, marginBottom: 10 },
    media: { width: '100%', height: 220, borderRadius: 12, backgroundColor: colors.surface },
    actions: { flexDirection: 'row', gap: 18, marginTop: 12 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    actionText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
    empty: { alignItems: 'center', paddingTop: 40, gap: 10 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.textMuted },
  });
}
