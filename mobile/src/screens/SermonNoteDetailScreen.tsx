import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchSermonNote } from '../api/sermonNotes';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import type { RootStackParamList } from '../navigation/types';
import { useTheme, type ThemeColors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SermonNoteDetail'>;

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function SermonNoteDetailScreen({ route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { noteId } = route.params;

  const noteQuery = useQuery({
    queryKey: ['sermon-notes', noteId],
    queryFn: () => fetchSermonNote(noteId),
  });

  if (noteQuery.isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
        <LoadingView />
      </SafeAreaView>
    );
  }

  if (noteQuery.isError || !noteQuery.data) {
    return (
      <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
        <ErrorView
          message={String(noteQuery.error ?? 'Не найдено')}
          onRetry={() => void noteQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  const note = noteQuery.data;
  const body =
    note.body_format === 'html' ? stripHtml(note.body || '') : note.body?.trim() || '';

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {note.topic ? <Text style={styles.topic}>{note.topic}</Text> : null}
        {note.scripture ? <Text style={styles.scripture}>{note.scripture}</Text> : null}
        <View style={styles.bodyCard}>
          <Text style={styles.body}>{body || 'Пустой конспект'}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    content: { padding: 16, paddingBottom: 40 },
    topic: { fontSize: 14, color: colors.textSecondary, marginBottom: 6 },
    scripture: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.primary,
      marginBottom: 16,
    },
    bodyCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      padding: 16,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.06)',
    },
    body: { fontSize: 16, lineHeight: 24, color: colors.text },
  });
}
