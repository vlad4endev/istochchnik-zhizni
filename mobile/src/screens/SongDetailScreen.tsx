import { Ionicons } from '@expo/vector-icons';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchSong } from '../api/songs';
import { fetchVersionForSong } from '../api/studio';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { useStudioAccess } from '../hooks/useStudioAccess';
import type { RootStackParamList } from '../navigation/types';
import { useTheme, type ThemeColors } from '../theme';

type Route = RouteProp<RootStackParamList, 'SongDetail'>;

export function SongDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { songId, title } = route.params;
  const { canView: canEditStudio } = useStudioAccess();

  const songQuery = useQuery({
    queryKey: ['song', songId],
    queryFn: () => fetchSong(songId),
  });

  const versionQuery = useQuery({
    queryKey: ['studio', 'version', songId],
    queryFn: () => fetchVersionForSong(songId),
    enabled: canEditStudio,
  });

  const song = songQuery.data;
  const version = versionQuery.data;
  const displayKey = version?.custom_key || song?.default_key || null;
  const displayContent = (version?.custom_content ?? song?.content ?? '').toString();
  const usingPersonal = Boolean(version?.custom_content);

  const meta: string[] = [];
  if (displayKey) meta.push(`Тональность: ${displayKey}`);
  if (song?.tempo) meta.push(`${song.tempo} BPM`);
  if (song?.time_signature) meta.push(song.time_signature);
  if (usingPersonal) meta.push('ваша версия');

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {songQuery.isLoading ? <LoadingView /> : null}
      {songQuery.isError ? (
        <ErrorView
          message={songQuery.error instanceof Error ? songQuery.error.message : 'Ошибка'}
          onRetry={() => void songQuery.refetch()}
        />
      ) : null}

      {song ? (
        <>
          {canEditStudio ? (
            <Pressable
              onPress={() =>
                navigation.navigate('StudioSongEdit', {
                  songId,
                  title: title || song.title || 'Песня',
                })
              }
              style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.9 }]}
            >
              <Ionicons name="create-outline" size={18} color={colors.primary} />
              <Text style={styles.editBtnText}>Редактировать в студии</Text>
            </Pressable>
          ) : null}

          {meta.length > 0 ? <Text style={styles.meta}>{meta.join(' · ')}</Text> : null}
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
            {displayContent.trim() || 'Текст песни пока не добавлен.'}
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
    editBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.08)',
      backgroundColor: colors.surfaceElevated,
      marginBottom: 14,
    },
    editBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.primary,
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
