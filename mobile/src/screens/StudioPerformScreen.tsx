import { Ionicons } from '@expo/vector-icons';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchPerformance } from '../api/studio';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import type { RootStackParamList } from '../navigation/types';
import { useTheme, type ThemeColors } from '../theme';

type Route = RouteProp<RootStackParamList, 'StudioPerform'>;

export function StudioPerformScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const route = useRoute<Route>();
  const navigation = useNavigation();
  const { setlistId } = route.params;
  const width = Dimensions.get('window').width;

  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  const perfQuery = useQuery({
    queryKey: ['studio', 'perform', setlistId],
    queryFn: () => fetchPerformance(setlistId),
  });

  const items = perfQuery.data?.items ?? [];
  const setlistTitle = perfQuery.data?.setlist.title ?? route.params.title ?? 'Сетлист';

  useEffect(() => {
    setIndex(0);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [setlistId]);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / width);
      if (i >= 0 && i < items.length) setIndex(i);
    },
    [width, items.length],
  );

  const go = (dir: -1 | 1) => {
    const next = Math.max(0, Math.min(items.length - 1, index + dir));
    setIndex(next);
    listRef.current?.scrollToIndex({ index: next, animated: true });
  };

  if (perfQuery.isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <LoadingView />
      </SafeAreaView>
    );
  }

  if (perfQuery.isError) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ErrorView
          message={perfQuery.error instanceof Error ? perfQuery.error.message : 'Ошибка'}
          onRetry={() => void perfQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>В сетлисте нет песен</Text>
          <Pressable onPress={() => navigation.goBack()} style={styles.emptyBtn}>
            <Text style={styles.emptyBtnText}>Назад</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const current = items[index];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.topMeta}>
          <Text style={styles.setlistTitle} numberOfLines={1}>
            {setlistTitle}
          </Text>
          <Text style={styles.counter}>
            {index + 1} / {items.length}
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      {current ? (
        <View style={styles.songHeader}>
          <Text style={styles.songTitle}>{current.song.title}</Text>
          {current.effective_key ? (
            <Text style={styles.songKey}>{current.effective_key}</Text>
          ) : null}
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={items}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => {
          const body = item.effective_content?.trim() || item.song.content?.trim() || '';
          return (
            <ScrollView
              style={{ width }}
              contentContainerStyle={styles.lyricsScroll}
              showsVerticalScrollIndicator
            >
              <Text style={styles.lyrics} selectable>
                {body || 'Текст не добавлен'}
              </Text>
            </ScrollView>
          );
        }}
      />

      <View style={styles.navBar}>
        <Pressable
          onPress={() => go(-1)}
          disabled={index <= 0}
          style={[styles.navBtn, index <= 0 && styles.navBtnDisabled]}
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={() => go(1)}
          disabled={index >= items.length - 1}
          style={[styles.navBtn, index >= items.length - 1 && styles.navBtnDisabled]}
        >
          <Ionicons name="chevron-forward" size={28} color={colors.text} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'rgba(28,25,23,0.08)',
    },
    iconBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topMeta: {
      flex: 1,
      alignItems: 'center',
    },
    setlistTitle: {
      fontSize: 13,
      color: colors.textMuted,
      maxWidth: '100%',
    },
    counter: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
      marginTop: 2,
    },
    songHeader: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 8,
      alignItems: 'center',
    },
    songTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
    },
    songKey: {
      marginTop: 6,
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    lyricsScroll: {
      paddingHorizontal: 20,
      paddingBottom: 40,
      paddingTop: 8,
    },
    lyrics: {
      fontSize: 17,
      lineHeight: 28,
      color: colors.text,
    },
    navBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(28,25,23,0.08)',
    },
    navBtn: {
      padding: 8,
    },
    navBtnDisabled: {
      opacity: 0.3,
    },
    emptyWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 16,
    },
    emptyText: {
      fontSize: 15,
      color: colors.textMuted,
      textAlign: 'center',
    },
    emptyBtn: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    emptyBtnText: {
      color: colors.textOnPrimary,
      fontWeight: '700',
    },
  });
}
