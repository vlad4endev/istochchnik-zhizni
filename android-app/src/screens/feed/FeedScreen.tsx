import {useCallback, useState} from 'react';
import {FlatList, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';

import {Loading} from '../../components/ui/Loading';
import {Screen} from '../../components/ui/Screen';
import type FeedPost from '../../db/models/FeedPost';
import {feedCacheRepository} from '../../repositories/FeedCacheRepository';
import {triggerSync} from '../../sync/useNetworkSync';
import {useSyncStatusStore} from '../../sync/syncStatusStore';

function FeedCard({post}: {post: FeedPost}) {
  const mediaCount = post.media.length;
  return (
    <View className="border-b border-stone-100 bg-white px-4 py-4">
      <Text className="text-sm font-semibold text-primary">{post.authorLabel}</Text>
      {post.caption ? (
        <Text className="mt-2 text-base leading-6 text-stone-800">{post.caption}</Text>
      ) : null}
      {mediaCount > 0 ? (
        <Text className="mt-2 text-sm text-stone-500">
          Медиа: {mediaCount} · ♥ {post.likeCount} · 💬 {post.commentCount}
        </Text>
      ) : (
        <Text className="mt-2 text-sm text-stone-500">
          ♥ {post.likeCount} · 💬 {post.commentCount}
        </Text>
      )}
    </View>
  );
}

export function FeedScreen() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isOnline = useSyncStatusStore(s => s.isOnline);

  const load = useCallback(async () => {
    const rows = await feedCacheRepository.listCached(50);
    setPosts(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setLoading(true);
        await load();
        setLoading(false);
      })();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (isOnline) await triggerSync();
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <Loading label="Лента…" />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View className="border-b border-stone-200 px-4 py-3">
        <Text className="text-2xl font-bold text-primary">Лента</Text>
        <Text className="text-sm text-stone-500">
          Кэш из локальной БД{isOnline ? '' : ' · офлайн'}
        </Text>
      </View>
      <FlatList
        data={posts}
        keyExtractor={item => item.id}
        refreshing={refreshing}
        onRefresh={onRefresh}
        renderItem={({item}) => <FeedCard post={item} />}
        ListEmptyComponent={
          <View className="p-8">
            <Text className="text-center text-stone-500">
              Постов пока нет. Потяните вниз, чтобы синхронизировать ленту с сервером.
            </Text>
          </View>
        }
      />
    </Screen>
  );
}
