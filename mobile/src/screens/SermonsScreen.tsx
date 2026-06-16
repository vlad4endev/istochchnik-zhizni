import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchPodcastFeed, type PodcastEpisode } from '../api/resources';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { ScreenHeader } from '../components/ScreenHeader';
import { useSermonPlayer } from '../contexts/SermonPlayerContext';
import {
  episodeSubtitle,
  formatPubDate,
  stripHtml,
} from '../lib/sermonFormat';
import { useSermonsStore } from '../stores/sermonsStore';
import { useTheme, type ThemeColors } from '../theme';

function EpisodeCard({ ep, isActive }: { ep: PodcastEpisode; isActive: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createCardStyles(colors), [colors]);
  const { playEpisode } = useSermonPlayer();
  const toggleFavorite = useSermonsStore((s) => s.toggleFavorite);
  const isFav = useSermonsStore((s) => Boolean(s.favorites[ep.id]));
  const ratio = useSermonsStore((s) => s.getProgressRatio(ep.id));
  const listened = useSermonsStore((s) => s.isListened(ep.id));
  const sub = episodeSubtitle(ep);

  const statusLabel = listened
    ? 'ПРОСЛУШАНО'
    : ratio > 0
      ? `${Math.round(ratio * 100)}%`
      : 'НОВОЕ';

  const onShare = async () => {
    const url = ep.pageUrl ?? ep.audioUrl;
    try {
      await Share.share({ message: `${ep.title}\n${url}`, title: ep.title });
    } catch {
      /* ignore */
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.art}>
          {ep.imageUrl ? (
            <Image source={{ uri: ep.imageUrl }} style={styles.artImg} contentFit="cover" />
          ) : (
            <View style={styles.artPlaceholder}>
              <Ionicons name="headset-outline" size={24} color={colors.textMuted} />
            </View>
          )}
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>{ep.title}</Text>
          {sub ? <Text style={styles.sub}>{sub}</Text> : null}

          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%` }]} />
            </View>
            <Text
              style={[
                styles.badge,
                listened ? styles.badgeDone : styles.badgeNew,
                listened ? styles.badgeDoneText : styles.badgeNewText,
              ]}
            >
              {statusLabel}
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={() => playEpisode(ep)}
              style={({ pressed }) => [
                styles.btnPrimary,
                isActive && styles.btnPrimaryActive,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Ionicons
                name={isActive ? 'radio' : 'play'}
                size={16}
                color={isActive ? colors.textOnPrimary : '#fff'}
              />
              <Text
                style={[
                  styles.btnPrimaryText,
                  isActive && { color: colors.textOnPrimary },
                ]}
              >
                {isActive ? 'В плеере' : 'Слушать'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => toggleFavorite(ep.id)}
              style={({ pressed }) => [
                styles.btnSecondary,
                isFav && styles.btnFav,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Ionicons
                name={isFav ? 'heart' : 'heart-outline'}
                size={16}
                color={isFav ? '#e11d48' : colors.textSecondary}
              />
              <Text style={[styles.btnSecondaryText, isFav && styles.btnFavText]}>
                {isFav ? 'В избранном' : 'В избранное'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.actions}>
            {ep.pageUrl ? (
              <>
                <Pressable onPress={() => void onShare()} style={styles.btnGhost}>
                  <Ionicons name="share-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.btnGhostText}>Поделиться</Text>
                </Pressable>
                <Pressable
                  onPress={() => void Linking.openURL(ep.pageUrl!)}
                  style={styles.btnGhost}
                >
                  <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.btnGhostText}>Открыть</Text>
                </Pressable>
              </>
            ) : null}
          </View>

          {ep.description ? (
            <Text style={styles.description} numberOfLines={3}>
              {stripHtml(ep.description)}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function SermonsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const { activeEpisode } = useSermonPlayer();
  const hydrate = useSermonsStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const feedQuery = useQuery({
    queryKey: ['resources', 'podcasts'],
    queryFn: () => fetchPodcastFeed({ limit: 120 }),
  });

  const feed = feedQuery.data?.feed ?? null;
  const episodes = useMemo(
    () => (Array.isArray(feedQuery.data?.episodes) ? feedQuery.data.episodes : []),
    [feedQuery.data],
  );

  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return episodes;
    return episodes.filter((e) => {
      const hay = `${e.title}\n${e.description ?? ''}`.toLowerCase();
      return hay.includes(t);
    });
  }, [episodes, query]);

  const listBottomPad = activeEpisode ? 220 : 24;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Проповеди" subtitle="Аудио подкасты" />

      <View style={styles.feedHero}>
        <View style={styles.feedArt}>
          {feed?.imageUrl ? (
            <Image source={{ uri: feed.imageUrl }} style={styles.feedArtImg} contentFit="cover" />
          ) : (
            <View style={styles.feedArtPlaceholder}>
              <Ionicons name="headset-outline" size={28} color={colors.textMuted} />
            </View>
          )}
        </View>
        <View style={styles.feedMeta}>
          <Text style={styles.feedTitle}>{feed?.title ?? 'Аудио проповеди'}</Text>
          <Text style={styles.feedDesc} numberOfLines={2}>
            {feed?.description?.trim() ||
              'Слушайте проповеди, добавляйте в избранное и продолжайте с того места, где остановились.'}
          </Text>
          <Text style={styles.feedStats}>
            {filtered.length} выпусков
            {feed?.lastBuildDate
              ? ` · обновление ${formatPubDate(feed.lastBuildDate) ?? ''}`
              : ''}
          </Text>
        </View>
        <Pressable
          onPress={() => void feedQuery.refetch()}
          style={({ pressed }) => [styles.refreshBtn, pressed && { opacity: 0.8 }]}
          disabled={feedQuery.isFetching}
        >
          <Ionicons
            name="refresh-outline"
            size={22}
            color={colors.primary}
            style={feedQuery.isFetching ? { opacity: 0.5 } : undefined}
          />
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={20} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Поиск по названию или описанию…"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
        />
      </View>

      {feedQuery.isLoading ? (
        <LoadingView />
      ) : feedQuery.isError ? (
        <ErrorView
          message={
            feedQuery.error instanceof Error ? feedQuery.error.message : 'Ошибка загрузки'
          }
          onRetry={() => void feedQuery.refetch()}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: listBottomPad }]}
          renderItem={({ item }) => (
            <EpisodeCard ep={item} isActive={activeEpisode?.id === item.id} />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {episodes.length === 0 ? 'Пока нет выпусков' : 'Ничего не найдено'}
              </Text>
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
    feedHero: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 8,
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      padding: 14,
    },
    feedArt: {
      width: 64,
      height: 64,
      borderRadius: 14,
      overflow: 'hidden',
    },
    feedArtImg: { width: '100%', height: '100%' },
    feedArtPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    feedMeta: { flex: 1, minWidth: 0 },
    feedTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text,
    },
    feedDesc: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
      lineHeight: 18,
    },
    feedStats: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
      marginTop: 6,
    },
    refreshBtn: {
      padding: 8,
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
      paddingTop: 4,
    },
    empty: {
      paddingVertical: 48,
      alignItems: 'center',
    },
    emptyTitle: {
      fontSize: 15,
      color: colors.textSecondary,
      fontWeight: '600',
    },
  });
}

function createCardStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      padding: 14,
      marginBottom: 12,
      shadowColor: '#1c1917',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 2,
    },
    row: {
      flexDirection: 'row',
      gap: 12,
    },
    art: {
      width: 64,
      height: 64,
      borderRadius: 14,
      overflow: 'hidden',
    },
    artImg: { width: '100%', height: '100%' },
    artPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    body: { flex: 1, minWidth: 0 },
    title: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text,
      lineHeight: 20,
    },
    sub: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      marginTop: 4,
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 10,
    },
    progressTrack: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: 'rgba(28,25,23,0.08)',
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.primary,
    },
    badge: {
      fontSize: 9,
      fontWeight: '800',
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
      overflow: 'hidden',
    },
    badgeDone: {
      backgroundColor: '#d1fae5',
    },
    badgeDoneText: {
      color: '#047857',
    },
    badgeNew: {
      backgroundColor: 'transparent',
    },
    badgeNewText: {
      color: colors.textMuted,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
    },
    btnPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#1c1917',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
    },
    btnPrimaryActive: {
      backgroundColor: colors.primary,
    },
    btnPrimaryText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 13,
    },
    btnSecondary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.12)',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
    },
    btnFav: {
      backgroundColor: '#fff1f2',
      borderColor: '#fecdd3',
    },
    btnSecondaryText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    btnFavText: {
      color: '#e11d48',
    },
    btnGhost: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    btnGhostText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    description: {
      marginTop: 10,
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
    },
  });
}
