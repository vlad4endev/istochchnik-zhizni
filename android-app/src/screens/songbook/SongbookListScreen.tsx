import {useCallback, useMemo, useState} from 'react';
import {FlatList, Pressable, Text, TextInput, View} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {Loading} from '../../components/ui/Loading';
import {Screen} from '../../components/ui/Screen';
import {songRepository} from '../../repositories/SongRepository';
import type {SongListItem} from '../../shared/songbook/types';
import type {RootStackParamList} from '../../app/types';
import {triggerSync} from '../../sync/useNetworkSync';
import {useSyncStatusStore} from '../../sync/syncStatusStore';

export function SongbookListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [songs, setSongs] = useState<SongListItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isOnline = useSyncStatusStore(s => s.isOnline);

  const load = useCallback(async () => {
    const rows = await songRepository.getAll();
    setSongs(rows);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter(
      s =>
        s.title.toLowerCase().includes(q) ||
        (s.default_key ?? '').toLowerCase().includes(q) ||
        String(s.song_number ?? '').includes(q),
    );
  }, [songs, query]);

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
        <Loading label="Загрузка песен…" />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View className="border-b border-stone-200 px-4 py-3">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-2xl font-bold text-primary">Песенник</Text>
            <Text className="text-sm text-stone-500">{songs.length} песен локально</Text>
          </View>
          <Pressable
            className="rounded-full bg-primary px-4 py-2 active:opacity-90"
            onPress={() => navigation.navigate('SongEdit', {})}>
            <Text className="font-semibold text-white">+ Песня</Text>
          </Pressable>
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Поиск по названию, тональности…"
          placeholderTextColor="#a8a29e"
          className="mt-3 rounded-xl border border-stone-200 bg-white px-3 py-2 text-base text-stone-900"
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerClassName="pb-8"
        renderItem={({item}) => (
          <Pressable
            className="border-b border-stone-100 px-4 py-3 active:bg-stone-100"
            onPress={() => navigation.navigate('SongDetail', {songId: item.id})}>
            <View className="flex-row items-baseline gap-2">
              {item.song_number != null ? (
                <Text className="text-sm font-medium text-stone-400">#{item.song_number}</Text>
              ) : null}
              <Text className="flex-1 text-base font-semibold text-stone-900">{item.title}</Text>
            </View>
            {item.default_key ? (
              <Text className="text-sm text-stone-500">Тональность: {item.default_key}</Text>
            ) : null}
          </Pressable>
        )}
        ListEmptyComponent={
          <View className="p-8">
            <Text className="text-center text-stone-500">
              {query
                ? 'Ничего не найдено'
                : 'Песен пока нет. Потяните вниз для синхронизации или добавьте песню.'}
            </Text>
          </View>
        }
      />
    </Screen>
  );
}
