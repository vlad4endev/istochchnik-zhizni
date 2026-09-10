import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useMemo } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchSermonNotes } from '../api/sermonNotes';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { ScreenHeader } from '../components/ScreenHeader';
import type { RootStackParamList } from '../navigation/types';
import { useTheme, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'MySermons'>;

export function MySermonsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();

  const notesQuery = useQuery({
    queryKey: ['sermon-notes'],
    queryFn: fetchSermonNotes,
  });

  if (notesQuery.isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Мои проповеди" subtitle="Конспекты проповедника" />
        <LoadingView />
      </SafeAreaView>
    );
  }

  if (notesQuery.isError) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Мои проповеди" subtitle="Конспекты проповедника" />
        <ErrorView
          message={String(notesQuery.error)}
          onRetry={() => void notesQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  const notes = notesQuery.data ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Мои проповеди" subtitle="Конспекты проповедника" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={notesQuery.isFetching}
            onRefresh={() => void notesQuery.refetch()}
          />
        }
      >
        {notes.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>Пока нет конспектов</Text>
          </View>
        ) : (
          notes.map((note) => (
            <Pressable
              key={note.id}
              onPress={() =>
                navigation.navigate('SermonNoteDetail', {
                  noteId: note.id,
                  title: note.title || 'Конспект',
                })
              }
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.title}>{note.title?.trim() || 'Без названия'}</Text>
              {note.topic ? <Text style={styles.meta}>{note.topic}</Text> : null}
              {note.scripture ? (
                <Text style={styles.scripture}>{note.scripture}</Text>
              ) : null}
              <Text style={styles.date}>
                Обновлено {format(parseISO(note.updated_at), 'd MMM yyyy', { locale: ru })}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    content: { padding: 16, paddingBottom: 40 },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.06)',
    },
    title: { fontSize: 16, fontWeight: '800', color: colors.text },
    meta: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
    scripture: { fontSize: 13, color: colors.primary, marginTop: 6, fontWeight: '600' },
    date: { fontSize: 12, color: colors.textMuted, marginTop: 10 },
    empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
    emptyText: { color: colors.textMuted, fontWeight: '600' },
  });
}
