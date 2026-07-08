import {useEffect, useState} from 'react';
import {ScrollView, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {Loading} from '../../components/ui/Loading';
import {Screen} from '../../components/ui/Screen';
import {songRepository} from '../../repositories/SongRepository';
import type {SongListItem} from '../../shared/songbook/types';
import type {RootStackParamList} from '../../app/types';

type Props = NativeStackScreenProps<RootStackParamList, 'SongDetail'>;

export function SongDetailScreen({route}: Props) {
  const {songId} = route.params;
  const [song, setSong] = useState<SongListItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const row = await songRepository.getById(songId);
      setSong(row);
      setLoading(false);
    })();
  }, [songId]);

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
    <Screen className="p-0">
      <View className="border-b border-stone-200 px-4 py-3">
        <Text className="text-2xl font-bold text-stone-900">{song.title}</Text>
        {song.default_key ? (
          <Text className="text-sm text-stone-500">Тональность: {song.default_key}</Text>
        ) : null}
      </View>
      <ScrollView className="flex-1 px-4 py-4" contentContainerClassName="pb-8">
        <Text className="font-mono text-base leading-7 text-stone-800">{song.content || '—'}</Text>
      </ScrollView>
    </Screen>
  );
}
