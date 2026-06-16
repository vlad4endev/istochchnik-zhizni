import type { RouteProp } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchSong } from '../api/songs';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import type { RootStackParamList } from '../navigation/types';
import { useTheme, type ThemeColors } from '../theme';

type Route = RouteProp<RootStackParamList, 'SongDetail'>;

export function SongDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const route = useRoute<Route>();
  const { songId } = route.params;

  const songQuery = useQuery({
    queryKey: ['song', songId],
    queryFn: () => fetchSong(songId),
  });

  const song = songQuery.data;
  const meta: string[] = [];
  if (song?.default_key) meta.push(`Тональность: ${song.default_key}`);
  if (song?.tempo) meta.push(`${song.tempo} BPM`);
  if (song?.time_signature) meta.push(song.time_signature);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      {songQuery.isLoading ? <LoadingView /> : null}
      {songQuery.isError ? (
        <ErrorView
          message={songQuery.error instanceof Error ? songQuery.error.message : 'Ошибка'}
          onRetry={() => void songQuery.refetch()}
        />
      ) : null}

      {song ? (
        <>
          {meta.length > 0 ? (
            <Text style={styles.meta}>{meta.join(' · ')}</Text>
          ) : null}
          {song.tags.length > 0 ? (
            <View style={styles.tags}>
              {song.tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={styles.lyrics} selectable>
            {song.content.trim() || 'Текст песни пока не добавлен.'}
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: 20,
      paddingBottom: 40,
    },
    meta: {
      fontSize: 13,
      color: colors.textMuted,
      marginBottom: 12,
      fontWeight: '600',
    },
    tags: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 16,
    },
    tag: {
      backgroundColor: `${colors.primary}14`,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    tagText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
    lyrics: {
      fontSize: 16,
      lineHeight: 26,
      color: colors.text,
      fontFamily: undefined,
    },
  });
}
