import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchSongs, type SongListItem } from '../api/songs';
import {
  createSetlist,
  fetchMyVersions,
  fetchRecentSongs,
  fetchSetlists,
  type SetlistRow,
  type StudioVersionListItem,
} from '../api/studio';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { ScreenHeader } from '../components/ScreenHeader';
import { useStudioAccess } from '../hooks/useStudioAccess';
import type { RootStackParamList } from '../navigation/types';
import { useTheme, type ThemeColors } from '../theme';

type TabKey = 'catalog' | 'mine' | 'setlists';

const TAB_LABELS: Record<TabKey, string> = {
  catalog: 'Каталог',
  mine: 'Мои версии',
  setlists: 'Сетлисты',
};

export function StudioScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { canView, isLoading: accessLoading } = useStudioAccess();
  const [tab, setTab] = useState<TabKey>('setlists');
  const [search, setSearch] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const qc = useQueryClient();

  const catalogQuery = useQuery({
    queryKey: ['studio', 'catalog', search],
    queryFn: () => fetchSongs(search),
    enabled: canView && tab === 'catalog',
  });

  const versionsQuery = useQuery({
    queryKey: ['studio', 'versions'],
    queryFn: fetchMyVersions,
    enabled: canView && tab === 'mine',
  });

  const recentQuery = useQuery({
    queryKey: ['studio', 'recent'],
    queryFn: () => fetchRecentSongs(12),
    enabled: canView && tab === 'mine',
  });

  const setlistsQuery = useQuery({
    queryKey: ['studio', 'setlists'],
    queryFn: fetchSetlists,
    enabled: canView && tab === 'setlists',
  });

  const createMut = useMutation({
    mutationFn: () => createSetlist(newTitle.trim(), null),
    onSuccess: (row) => {
      setNewTitle('');
      void qc.invalidateQueries({ queryKey: ['studio', 'setlists'] });
      navigation.navigate('StudioSetlistDetail', {
        setlistId: Number(row.id),
        title: row.title,
      });
    },
    onError: (err: unknown) => {
      Alert.alert(
        'Ошибка',
        err instanceof Error ? err.message : 'Не удалось создать сетлист',
      );
    },
  });

  const openSong = (song: SongListItem | { id: string; title: string }) => {
    navigation.navigate('SongDetail', {
      songId: Number(song.id),
      title: song.title || 'Песня',
    });
  };

  const refreshing =
    (tab === 'catalog' && catalogQuery.isFetching) ||
    (tab === 'mine' && (versionsQuery.isFetching || recentQuery.isFetching)) ||
    (tab === 'setlists' && setlistsQuery.isFetching);

  const onRefresh = () => {
    if (tab === 'catalog') void catalogQuery.refetch();
    if (tab === 'mine') {
      void versionsQuery.refetch();
      void recentQuery.refetch();
    }
    if (tab === 'setlists') void setlistsQuery.refetch();
  };

  if (accessLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <ScreenHeader title="Студия" subtitle="Для музыкантов" />
        <LoadingView />
      </SafeAreaView>
    );
  }

  if (!canView) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <ScreenHeader title="Студия" subtitle="Для музыкантов" />
        <View style={styles.denied}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
          <Text style={styles.deniedTitle}>Нет доступа</Text>
          <Text style={styles.deniedBody}>
            Раздел «Студия» доступен музыкантам и служителям музыкального направления.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Студия" subtitle="Каталог, версии и сетлисты" />

      <View style={styles.tabs}>
        {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={[styles.tab, tab === key && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
              {TAB_LABELS[key]}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'catalog' ? (
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Поиск в каталоге…"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      ) : null}

      {tab === 'setlists' ? (
        <View style={styles.createRow}>
          <TextInput
            style={styles.createInput}
            value={newTitle}
            onChangeText={setNewTitle}
            placeholder="Название нового сетлиста"
            placeholderTextColor={colors.textMuted}
          />
          <Pressable
            onPress={() => {
              if (!newTitle.trim()) {
                Alert.alert('Название', 'Введите название сетлиста');
                return;
              }
              createMut.mutate();
            }}
            disabled={createMut.isPending}
            style={({ pressed }) => [
              styles.createBtn,
              pressed && { opacity: 0.85 },
              createMut.isPending && { opacity: 0.6 },
            ]}
          >
            <Ionicons name="add" size={22} color={colors.textOnPrimary} />
          </Pressable>
        </View>
      ) : null}

      {tab === 'catalog' && catalogQuery.isLoading ? <LoadingView /> : null}
      {tab === 'catalog' && catalogQuery.isError ? (
        <ErrorView
          message={catalogQuery.error instanceof Error ? catalogQuery.error.message : 'Ошибка'}
          onRetry={() => void catalogQuery.refetch()}
        />
      ) : null}

      {tab === 'mine' && versionsQuery.isLoading ? <LoadingView /> : null}
      {tab === 'setlists' && setlistsQuery.isLoading ? <LoadingView /> : null}

      {tab === 'catalog' ? (
        <FlatList
          data={catalogQuery.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <SongRow
              title={item.title}
              subtitle={[
                item.song_number != null ? `№ ${item.song_number}` : null,
                item.default_key,
              ]
                .filter(Boolean)
                .join(' · ')}
              onPress={() => openSong(item)}
              colors={colors}
            />
          )}
          ListEmptyComponent={
            !catalogQuery.isLoading ? (
              <Text style={styles.empty}>Песни не найдены</Text>
            ) : null
          }
        />
      ) : null}

      {tab === 'mine' ? (
        <FlatList
          data={[
            ...(versionsQuery.data ?? []).map((v) => ({ kind: 'version' as const, v })),
            ...(recentQuery.data ?? []).map((s) => ({ kind: 'recent' as const, s })),
          ]}
          keyExtractor={(item) =>
            item.kind === 'version' ? `v-${item.v.id}` : `r-${item.s.id}`
          }
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            (versionsQuery.data?.length ?? 0) > 0 ? (
              <Text style={styles.sectionLabel}>Сохранённые версии</Text>
            ) : null
          }
          renderItem={({ item }) => {
            if (item.kind === 'version') {
              return (
                <VersionRow
                  version={item.v}
                  onPress={() =>
                    openSong({ id: item.v.song_id, title: item.v.song_title })
                  }
                  colors={colors}
                />
              );
            }
            return (
              <SongRow
                title={item.s.title}
                subtitle="Недавняя"
                onPress={() => openSong(item.s)}
                colors={colors}
              />
            );
          }}
          ListEmptyComponent={
            !versionsQuery.isLoading ? (
              <Text style={styles.empty}>Пока нет сохранённых версий</Text>
            ) : null
          }
        />
      ) : null}

      {tab === 'setlists' ? (
        <FlatList
          data={setlistsQuery.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <SetlistRow
              row={item}
              onPress={() =>
                navigation.navigate('StudioSetlistDetail', {
                  setlistId: Number(item.id),
                  title: item.title,
                })
              }
              colors={colors}
            />
          )}
          ListEmptyComponent={
            !setlistsQuery.isLoading ? (
              <Text style={styles.empty}>Создайте первый сетлист</Text>
            ) : null
          }
        />
      ) : null}
    </SafeAreaView>
  );
}

function SongRow({
  title,
  subtitle,
  onPress,
  colors,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createRowStyles(colors), [colors]);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title || 'Без названия'}
        </Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function VersionRow({
  version,
  onPress,
  colors,
}: {
  version: StudioVersionListItem;
  onPress: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createRowStyles(colors), [colors]);
  const updated = version.updated_at
    ? format(parseISO(version.updated_at), 'd MMM, HH:mm', { locale: ru })
    : '';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {version.song_title}
        </Text>
        <Text style={styles.rowSub}>
          {[version.custom_key, updated].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function SetlistRow({
  row,
  onPress,
  colors,
}: {
  row: SetlistRow;
  onPress: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createRowStyles(colors), [colors]);
  const dateLabel = row.event_date
    ? format(parseISO(row.event_date), 'd MMMM yyyy', { locale: ru })
    : null;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {row.title}
        </Text>
        <Text style={styles.rowSub}>
          {[dateLabel, row.is_public ? 'публичный' : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  const tabWeight: TextStyle['fontWeight'] = '600';
  const tabActiveWeight: TextStyle['fontWeight'] = '700';
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    denied: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 8,
    },
    deniedTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    deniedBody: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
    tabs: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginBottom: 12,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      padding: 4,
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 10,
    },
    tabActive: {
      backgroundColor: colors.primary,
    },
    tabText: {
      fontSize: 12,
      fontWeight: tabWeight,
      color: colors.textMuted,
    },
    tabTextActive: {
      color: colors.textOnPrimary,
      fontWeight: tabActiveWeight,
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.08)',
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      padding: 0,
    },
    createRow: {
      flexDirection: 'row',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 8,
    },
    createInput: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.08)',
    },
    createBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
      marginTop: 4,
    },
    empty: {
      textAlign: 'center',
      color: colors.textMuted,
      marginTop: 32,
      fontSize: 14,
    },
  });
}

function createRowStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 14,
      marginBottom: 8,
      borderRadius: 14,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.08)',
    },
    rowBody: {
      flex: 1,
      minWidth: 0,
    },
    rowTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    rowSub: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
  });
}
