import {useCallback, useState} from 'react';
import {FlatList, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';

import {Loading} from '../../components/ui/Loading';
import {Screen} from '../../components/ui/Screen';
import type MediaEvent from '../../db/models/MediaEvent';
import {mediaEventCacheRepository} from '../../repositories/MediaEventCacheRepository';
import {triggerSync} from '../../sync/useNetworkSync';
import {useSyncStatusStore} from '../../sync/syncStatusStore';

function EventCard({event}: {event: MediaEvent}) {
  const roles = event.assignments
    .map(a => [a.role_name, a.member_name].filter(Boolean).join(': '))
    .filter(Boolean)
    .join(' · ');

  return (
    <View className="border-b border-stone-100 bg-white px-4 py-4">
      <Text className="text-base font-semibold text-stone-900">{event.title}</Text>
      <Text className="mt-1 text-sm text-stone-500">
        {event.eventDate}
        {event.startTime ? ` · ${event.startTime}` : ''}
        {event.endTime ? `–${event.endTime}` : ''}
      </Text>
      {roles ? <Text className="mt-2 text-sm text-stone-600">{roles}</Text> : null}
    </View>
  );
}

export function MediaScheduleScreen() {
  const [events, setEvents] = useState<MediaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isOnline = useSyncStatusStore(s => s.isOnline);

  const load = useCallback(async () => {
    setEvents(await mediaEventCacheRepository.listCached());
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
        <Loading label="Расписание…" />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View className="border-b border-stone-200 px-4 py-3">
        <Text className="text-2xl font-bold text-primary">Медиа</Text>
        <Text className="text-sm text-stone-500">
          Моё расписание · локальный кэш{isOnline ? '' : ' · офлайн'}
        </Text>
      </View>
      <FlatList
        data={events}
        keyExtractor={item => item.id}
        refreshing={refreshing}
        onRefresh={onRefresh}
        renderItem={({item}) => <EventCard event={item} />}
        ListEmptyComponent={
          <View className="p-8">
            <Text className="text-center text-stone-500">
              Событий нет. Потяните вниз для синхронизации (нужна роль медиа-команды).
            </Text>
          </View>
        }
      />
    </Screen>
  );
}
