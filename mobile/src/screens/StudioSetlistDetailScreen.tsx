import { Ionicons } from '@expo/vector-icons';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchSongs, type SongListItem } from '../api/songs';
import {
  addSetlistItem,
  deleteSetlist,
  fetchMyVersions,
  fetchSetlistItems,
  removeSetlistItem,
  type SetlistItemRow,
} from '../api/studio';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import type { RootStackParamList } from '../navigation/types';
import { useTheme, type ThemeColors } from '../theme';

type Route = RouteProp<RootStackParamList, 'StudioSetlistDetail'>;

export function StudioSetlistDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { setlistId, title } = route.params;
  const qc = useQueryClient();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [songSearch, setSongSearch] = useState('');

  const itemsQuery = useQuery({
    queryKey: ['studio', 'setlist', setlistId, 'items'],
    queryFn: () => fetchSetlistItems(setlistId),
  });

  const songsQuery = useQuery({
    queryKey: ['studio', 'picker-songs', songSearch],
    queryFn: () => fetchSongs(songSearch),
    enabled: pickerOpen,
  });

  const versionsQuery = useQuery({
    queryKey: ['studio', 'versions'],
    queryFn: fetchMyVersions,
    enabled: pickerOpen,
  });

  const addMut = useMutation({
    mutationFn: async (songId: number) => {
      const version = (versionsQuery.data ?? []).find((v) => Number(v.song_id) === songId);
      const studioVersionId = version ? Number(version.id) : null;
      await addSetlistItem(setlistId, songId, studioVersionId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['studio', 'setlist', setlistId] });
      setPickerOpen(false);
      setSongSearch('');
    },
    onError: (err: unknown) => {
      Alert.alert('Ошибка', err instanceof Error ? err.message : 'Не удалось добавить песню');
    },
  });

  const removeMut = useMutation({
    mutationFn: (itemId: number) => removeSetlistItem(setlistId, itemId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['studio', 'setlist', setlistId] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteSetlist(setlistId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['studio', 'setlists'] });
      navigation.goBack();
    },
    onError: (err: unknown) => {
      Alert.alert('Ошибка', err instanceof Error ? err.message : 'Не удалось удалить');
    },
  });

  const items = itemsQuery.data ?? [];
  const canPerform = items.length > 0;

  const confirmDelete = () => {
    Alert.alert('Удалить сетлист?', title, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteMut.mutate() },
    ]);
  };

  const confirmRemove = (item: SetlistItemRow) => {
    Alert.alert('Убрать из сетлиста?', item.song.title, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Убрать',
        style: 'destructive',
        onPress: () => removeMut.mutate(Number(item.id)),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {itemsQuery.isLoading ? <LoadingView /> : null}
      {itemsQuery.isError ? (
        <ErrorView
          message={itemsQuery.error instanceof Error ? itemsQuery.error.message : 'Ошибка'}
          onRetry={() => void itemsQuery.refetch()}
        />
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={itemsQuery.isFetching && !itemsQuery.isLoading}
            onRefresh={() => void itemsQuery.refetch()}
          />
        }
        ListHeaderComponent={
          <View style={styles.actions}>
            <Pressable
              onPress={() => setPickerOpen(true)}
              style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.9 }]}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              <Text style={styles.actionBtnText}>Добавить песню</Text>
            </Pressable>
            {canPerform ? (
              <Pressable
                onPress={() =>
                  navigation.navigate('StudioPerform', { setlistId, title })
                }
                style={({ pressed }) => [styles.performBtn, pressed && { opacity: 0.9 }]}
              >
                <Ionicons name="mic-outline" size={20} color={colors.textOnPrimary} />
                <Text style={styles.performBtnText}>Режим выступления</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={confirmDelete} style={styles.deleteLink}>
              <Text style={styles.deleteLinkText}>Удалить сетлист</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item, index }) => (
          <Pressable
            onLongPress={() => confirmRemove(item)}
            style={({ pressed }) => [styles.itemRow, pressed && { opacity: 0.92 }]}
          >
            <Text style={styles.itemPos}>{index + 1}</Text>
            <View style={styles.itemBody}>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {item.song.title}
              </Text>
              <Text style={styles.itemSub}>
                {[item.effective_key, item.studio_version_id ? 'моя версия' : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          !itemsQuery.isLoading ? (
            <Text style={styles.empty}>Добавьте песни в сетлист</Text>
          ) : null
        }
      />

      <Modal visible={pickerOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Добавить песню</Text>
            <Pressable onPress={() => setPickerOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={songSearch}
              onChangeText={setSongSearch}
              placeholder="Поиск…"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoFocus
            />
          </View>
          {songsQuery.isLoading ? <LoadingView /> : null}
          <FlatList
            data={songsQuery.data ?? []}
            keyExtractor={(s) => s.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }: { item: SongListItem }) => (
              <Pressable
                onPress={() => addMut.mutate(Number(item.id))}
                disabled={addMut.isPending}
                style={({ pressed }) => [styles.pickRow, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.pickTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.default_key ? (
                  <Text style={styles.pickSub}>{item.default_key}</Text>
                ) : null}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    list: {
      padding: 16,
      paddingBottom: 32,
    },
    actions: {
      gap: 10,
      marginBottom: 16,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.08)',
      backgroundColor: colors.surfaceElevated,
    },
    actionBtnText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.primary,
    },
    performBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: colors.primary,
    },
    performBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textOnPrimary,
    },
    deleteLink: {
      alignSelf: 'center',
      paddingVertical: 8,
    },
    deleteLinkText: {
      fontSize: 13,
      color: '#dc2626',
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      marginBottom: 8,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.08)',
    },
    itemPos: {
      width: 28,
      fontSize: 14,
      fontWeight: '700',
      color: colors.textMuted,
      textAlign: 'center',
    },
    itemBody: {
      flex: 1,
      minWidth: 0,
    },
    itemTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    itemSub: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    empty: {
      textAlign: 'center',
      color: colors.textMuted,
      marginTop: 24,
    },
    modalSafe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(28,25,23,0.08)',
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      margin: 16,
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
    pickRow: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'rgba(28,25,23,0.08)',
    },
    pickTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    pickSub: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
  });
}
