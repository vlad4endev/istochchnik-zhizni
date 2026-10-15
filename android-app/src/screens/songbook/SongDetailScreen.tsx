import {useCallback, useState} from 'react';
import {Alert, Pressable, ScrollView, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';

import {Loading} from '../../components/ui/Loading';
import {Screen} from '../../components/ui/Screen';
import {songRepository} from '../../repositories/SongRepository';
import type {SongListItem} from '../../shared/songbook/types';
import type {RootStackParamList} from '../../app/types';

type Props = NativeStackScreenProps<RootStackParamList, 'SongDetail'>;

export function SongDetailScreen({route, navigation}: Props) {
  const {songId} = route.params;
  const [song, setSong] = useState<SongListItem | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const row = await songRepository.getById(songId);
    setSong(row);
    setLoading(false);
  }, [songId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onDelete = () => {
    Alert.alert('Удалить песню?', 'Песня будет удалена локально и поставлена в очередь sync.', [
      {text: 'Отмена', style: 'cancel'},
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await songRepository.softDelete(songId);
            navigation.goBack();
          })();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  if (!song) {
    return (
      <Screen>
        <Text className="text-base text-stone-600">Песня не найдена</Text>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View className="border-b border-stone-200 px-4 py-3">
        <Text className="text-2xl font-bold text-stone-900">{song.title}</Text>
        {song.default_key ? (
          <Text className="text-sm text-stone-500">Тональность: {song.default_key}</Text>
        ) : null}
        <View className="mt-3 flex-row gap-2">
          <Pressable
            className="rounded-lg bg-primary px-3 py-2 active:opacity-90"
            onPress={() => navigation.navigate('SongEdit', {songId})}>
            <Text className="font-semibold text-white">Изменить</Text>
          </Pressable>
          <Pressable
            className="rounded-lg bg-stone-200 px-3 py-2 active:opacity-80"
            onPress={onDelete}>
            <Text className="font-medium text-stone-800">Удалить</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView className="flex-1 px-4 py-4" contentContainerClassName="pb-8">
        <Text className="font-mono text-base leading-7 text-stone-800">{song.content || '—'}</Text>
      </ScrollView>
    </Screen>
  );
}
