import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchSermonNote, updateSermonNote } from '../api/sermonNotes';
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

export function SermonNoteDetailScreen({ route, navigation }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { noteId } = route.params;
  const qc = useQueryClient();

  const noteQuery = useQuery({
    queryKey: ['sermon-notes', noteId],
    queryFn: () => fetchSermonNote(noteId),
  });

  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [scripture, setScripture] = useState('');
  const [body, setBody] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!noteQuery.data) return;
    setTitle(noteQuery.data.title ?? '');
    setTopic(noteQuery.data.topic ?? '');
    setScripture(noteQuery.data.scripture ?? '');
    const raw = noteQuery.data.body ?? '';
    setBody(noteQuery.data.body_format === 'html' ? stripHtml(raw) : raw);
  }, [noteQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateSermonNote(noteId, {
        title: title.trim() || 'Без названия',
        topic: topic.trim(),
        scripture: scripture.trim(),
        body,
        body_format: 'plain',
      }),
    onSuccess: (note) => {
      void qc.invalidateQueries({ queryKey: ['sermon-notes'] });
      setEditing(false);
      navigation.setOptions({ title: note.title || 'Конспект' });
      Alert.alert('Сохранено');
    },
    onError: (e) => Alert.alert('Ошибка', String(e)),
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

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.toolbar}>
          <Pressable
            onPress={() => (editing ? saveMutation.mutate() : setEditing(true))}
            style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.toolBtnText}>
              {saveMutation.isPending ? '…' : editing ? 'Сохранить' : 'Редактировать'}
            </Text>
          </Pressable>
          {editing ? (
            <Pressable
              onPress={() => {
                setEditing(false);
                const n = noteQuery.data;
                if (!n) return;
                setTitle(n.title ?? '');
                setTopic(n.topic ?? '');
                setScripture(n.scripture ?? '');
                const raw = n.body ?? '';
                setBody(n.body_format === 'html' ? stripHtml(raw) : raw);
              }}
              style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.cancelText}>Отмена</Text>
            </Pressable>
          ) : null}
        </View>

        {editing ? (
          <>
            <Text style={styles.label}>Название</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} />
            <Text style={styles.label}>Тема</Text>
            <TextInput style={styles.input} value={topic} onChangeText={setTopic} />
            <Text style={styles.label}>Писание</Text>
            <TextInput style={styles.input} value={scripture} onChangeText={setScripture} />
            <Text style={styles.label}>Текст</Text>
            <TextInput
              style={[styles.input, styles.bodyInput]}
              value={body}
              onChangeText={setBody}
              multiline
            />
          </>
        ) : (
          <>
            {topic ? <Text style={styles.topic}>{topic}</Text> : null}
            {scripture ? <Text style={styles.scripture}>{scripture}</Text> : null}
            <View style={styles.bodyCard}>
              <Text style={styles.body}>{body || 'Пустой конспект'}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    content: { padding: 16, paddingBottom: 40 },
    toolbar: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    toolBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
    },
    toolBtnText: { color: colors.textOnPrimary, fontWeight: '700' },
    cancelBtn: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.surfaceElevated,
    },
    cancelText: { color: colors.textMuted, fontWeight: '700' },
    label: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      marginBottom: 6,
      marginTop: 8,
    },
    input: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.1)',
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
    },
    bodyInput: { minHeight: 220, textAlignVertical: 'top' },
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
