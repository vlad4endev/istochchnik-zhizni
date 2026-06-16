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
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchSongs, type SongListItem } from '../api/songs';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { ScreenHeader } from '../components/ScreenHeader';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { useTheme, type ThemeColors } from '../theme';

type SongbookNav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Songbook'>,
  NativeStackNavigationProp<RootStackParamList>
>;

export function SongbookScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<SongbookNav>();
  const [search, setSearch] = useState('');

  const songsQuery = useQuery({
    queryKey: ['songs', search],
    queryFn: () => fetchSongs(search),
  });

  const songs = songsQuery.data ?? [];

  const openSong = (song: SongListItem) => {
    const id = Number(song.id);
    if (!Number.isFinite(id)) return;
    navigation.navigate('SongDetail', { songId: id, title: song.title });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Песенник" subtitle={`${songs.length} песен`} />

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={20} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Поиск по названию…"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {songsQuery.isLoading ? (
        <LoadingView />
      ) : songsQuery.isError ? (
        <ErrorView
          message={songsQuery.error instanceof Error ? songsQuery.error.message : 'Ошибка'}
          onRetry={() => void songsQuery.refetch()}
        />
      ) : (
        <FlatList
          data={songs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openSong(item)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={styles.rowLeft}>
                {item.song_number != null ? (
                  <Text style={styles.number}>{item.song_number}</Text>
                ) : (
                  <Ionicons name="musical-note" size={18} color={colors.primary} />
                )}
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {item.default_key ? (
                    <Text style={styles.rowMeta}>Тональность: {item.default_key}</Text>
                  ) : null}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Песни не найдены</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
      marginBottom: 8,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.08)',
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      padding: 0,
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      padding: 14,
      marginBottom: 8,
    },
    rowPressed: {
      opacity: 0.85,
    },
    rowLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    number: {
      width: 28,
      fontSize: 14,
      fontWeight: '700',
      color: colors.primary,
      textAlign: 'center',
    },
    rowText: {
      flex: 1,
    },
    rowTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    rowMeta: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    empty: {
      paddingVertical: 48,
      alignItems: 'center',
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 15,
    },
  });
}
