import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import {
  fetchChurchFeed,
  likeFeedPost,
  markFeedSeen,
  unlikeFeedPost,
  type FeedPost,
} from '../api/feed';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { ScreenHeader } from '../components/ScreenHeader';
import { resolvePublicUrl } from '../lib/resolvePublicUrl';
import { useTheme, type ThemeColors } from '../theme';

export function FeedScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const qc = useQueryClient();
  const [cursor, setCursor] = useState<string | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);

  const feedQuery = useQuery({
    queryKey: ['feed', 'page', cursor],
    queryFn: () => fetchChurchFeed({ cursor, limit: 20 }),
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

  const onRefresh = () => {
    setCursor(null);
    setPosts([]);
    void feedQuery.refetch();
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

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Лента" subtitle="Новости церкви" />
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={feedQuery.isFetching && !cursor} onRefresh={onRefresh} />
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
            <View style={styles.authorRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(item.author.name?.[0] ?? '?').toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.authorName}>{item.author.name}</Text>
                <Text style={styles.meta}>
                  {format(parseISO(item.created_at), 'd MMM, HH:mm', { locale: ru })}
                </Text>
              </View>
            </View>
            {item.caption ? <Text style={styles.caption}>{item.caption}</Text> : null}
            {(() => {
              const mediaUrl = resolvePublicUrl(item.media[0]?.url);
              if (!mediaUrl) return null;
              return (
                <Image
                  source={{ uri: mediaUrl }}
                  style={styles.media}
                  contentFit="cover"
                />
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
              <View style={styles.actionBtn}>
                <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted} />
                <Text style={styles.actionText}>{item.comment_count}</Text>
              </View>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    list: { padding: 16, paddingBottom: 40, gap: 12 },
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
    empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.textMuted },
  });
}
