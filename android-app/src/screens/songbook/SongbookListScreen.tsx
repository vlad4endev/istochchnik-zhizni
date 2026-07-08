import {useCallback, useEffect, useState} from 'react';
import {FlatList, Pressable, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {Loading} from '../../components/ui/Loading';
import {Screen} from '../../components/ui/Screen';
import {songRepository} from '../../repositories/SongRepository';
import type {SongListItem} from '../../shared/songbook/types';
import type {RootStackParamList} from '../../app/types';
import {triggerSync} from '../../sync/useNetworkSync';

export function SongbookListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [songs, setSongs] = useState<SongListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const rows = await songRepository.getAll();
    setSongs(rows);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await triggerSync();
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
    <Screen className="p-0">
      <View className="border-b border-stone-200 px-4 py-3">
        <Text className="text-2xl font-bold text-primary">Песенник</Text>
        <Text className="text-sm text-stone-500">{songs.length} песен локально</Text>
      </View>
      <FlatList
        data={songs}
        keyExtractor={item => item.id}
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerClassName="pb-8"
        renderItem={({item}) => (
          <Pressable
            className="border-b border-stone-100 px-4 py-3 active:bg-stone-100"
            onPress={() => navigation.navigate('SongDetail', {songId: item.id})}>
            <Text className="text-base font-semibold text-stone-900">{item.title}</Text>
            {item.default_key ? (
              <Text className="text-sm text-stone-500">Тональность: {item.default_key}</Text>
            ) : null}
          </Pressable>
        )}
        ListEmptyComponent={
          <View className="p-8">
            <Text className="text-center text-stone-500">
              Песен пока нет. Потяните вниз для синхронизации с сервером.
            </Text>
          </View>
        }
      />
    </Screen>
  );
}
