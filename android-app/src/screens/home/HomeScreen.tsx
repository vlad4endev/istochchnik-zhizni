import {useCallback, useState} from 'react';
import {Pressable, RefreshControl, ScrollView, Text, View} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';

import {Button} from '../../components/ui/Button';
import {Screen} from '../../components/ui/Screen';
import {useAuthStore} from '../../shared/auth/authStore';
import {triggerSync} from '../../sync/useNetworkSync';
import {useSyncStatusStore} from '../../sync/syncStatusStore';
import type {MainTabParamList} from '../../app/types';
import {feedCacheRepository} from '../../repositories/FeedCacheRepository';
import {mediaEventCacheRepository} from '../../repositories/MediaEventCacheRepository';

function formatSyncTime(ts: number | null): string {
  if (!ts) return 'ещё не было';
  try {
    return new Date(ts).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function HomeScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const firstName = useAuthStore(s => s.firstName);
  const lastName = useAuthStore(s => s.lastName);
  const phase = useSyncStatusStore(s => s.phase);
  const isOnline = useSyncStatusStore(s => s.isOnline);
  const lastSuccessAt = useSyncStatusStore(s => s.lastSuccessAt);
  const pendingCount = useSyncStatusStore(s => s.pendingCount);
  const songCount = useSyncStatusStore(s => s.songCount);
  const [feedCount, setFeedCount] = useState(0);
  const [mediaCount, setMediaCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadLocalStats = useCallback(async () => {
    const [feed, media] = await Promise.all([
      feedCacheRepository.listCached(100),
      mediaEventCacheRepository.listCached(),
    ]);
    setFeedCount(feed.length);
    setMediaCount(media.length);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadLocalStats();
    }, [loadLocalStats]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await triggerSync();
      await loadLocalStats();
    } finally {
      setRefreshing(false);
    }
  };

  const syncLabel =
    phase === 'syncing' ? 'Синхронизация…' : isOnline ? 'Синхронизировать' : 'Офлайн';

  return (
    <Screen padded={false}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 p-4 pb-10"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View className="gap-1">
          <Text className="text-sm font-medium uppercase tracking-wide text-primary">
            Источник жизни
          </Text>
          <Text className="text-3xl font-bold text-stone-900">
            Здравствуйте{firstName ? `, ${firstName}` : ''}
          </Text>
          <Text className="text-base text-stone-600">
            {lastName ? `${firstName} ${lastName} · ` : ''}
            Локальная база синхронизируется с сервером церкви.
          </Text>
        </View>

        <View className="gap-3 rounded-2xl border border-stone-200 bg-white p-4">
          <Text className="text-lg font-semibold text-stone-900">Синхронизация</Text>
          <Text className="text-sm text-stone-600">
            Статус: {isOnline ? 'в сети' : 'офлайн'}
            {phase === 'syncing' ? ' · идёт обмен' : ''}
          </Text>
          <Text className="text-sm text-stone-600">
            Последний успех: {formatSyncTime(lastSuccessAt)}
          </Text>
          <Text className="text-sm text-stone-600">Очередь исходящих: {pendingCount}</Text>
          <Button
            title={syncLabel}
            onPress={() => void onRefresh()}
            disabled={phase === 'syncing' || !isOnline}
          />
        </View>

        <View className="gap-3">
          <Text className="text-lg font-semibold text-stone-900">Разделы</Text>
          <Pressable
            className="rounded-xl border border-stone-200 bg-white px-4 py-3 active:bg-stone-50"
            onPress={() => navigation.navigate('Songbook')}>
            <Text className="text-base font-semibold text-stone-900">Песенник</Text>
            <Text className="text-sm text-stone-500">{songCount} песен офлайн</Text>
          </Pressable>
          <Pressable
            className="rounded-xl border border-stone-200 bg-white px-4 py-3 active:bg-stone-50"
            onPress={() => navigation.navigate('Feed')}>
            <Text className="text-base font-semibold text-stone-900">Лента</Text>
            <Text className="text-sm text-stone-500">
              {feedCount > 0 ? `${feedCount} постов в кэше` : 'Подтянется при синхронизации'}
            </Text>
          </Pressable>
          <Pressable
            className="rounded-xl border border-stone-200 bg-white px-4 py-3 active:bg-stone-50"
            onPress={() => navigation.navigate('MediaSchedule')}>
            <Text className="text-base font-semibold text-stone-900">Медиа-расписание</Text>
            <Text className="text-sm text-stone-500">
              {mediaCount > 0 ? `${mediaCount} событий в кэше` : 'Подтянется при синхронизации'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}
