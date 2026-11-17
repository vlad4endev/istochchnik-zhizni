import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatApiError } from '../../api/client';
import {
  deleteCoordinatorNote,
  fetchCoordinatorNotesForManage,
  inferNoteDuration,
  saveCoordinatorNote,
  type NoteDuration,
  type NoteKind,
} from '../../api/prayerAdmin';
import { todayIsoLocal } from '../../lib/date';
import { useTheme, type ThemeColors } from '../../theme';

const DURATIONS: Array<{ id: NoteDuration; label: string }> = [
  { id: 'day', label: 'Только сегодня' },
  { id: 'week', label: 'До конца этой недели' },
  { id: 'month', label: 'До конца месяца' },
];

const TITLES: Record<NoteKind, string> = {
  urgent_prayer: 'Срочная молитвенная нужда',
  announcement: 'Объявление',
};

const MAX_LENGTH = 2000;

type Props = { kind: NoteKind | null; onClose: () => void };

/** Редактор срочной нужды и объявления: текст + срок показа. Пустой текст убирает блок. */
export function NoteEditorModal({ kind, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [duration, setDuration] = useState<NoteDuration>('day');

  const current = useQuery({
    queryKey: ['calendar', 'dashboard-coordinator-notes', 'manage'],
    queryFn: fetchCoordinatorNotesForManage,
    enabled: kind != null,
    staleTime: 0,
  });

  const existing = kind ? current.data?.[kind] ?? null : null;

  useEffect(() => {
    if (!kind) return;
    setText(existing?.text ?? '');
    setDuration(existing ? inferNoteDuration(existing.start_date, existing.end_date) : 'day');
  }, [kind, existing]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['calendar', 'dashboard-coordinator-notes'] });
    void qc.invalidateQueries({ queryKey: ['dashboard', 'bundle'] });
  };

  const saveMut = useMutation({
    mutationFn: () =>
      saveCoordinatorNote({ kind: kind!, text: text.trim(), duration, today_key: todayIsoLocal() }),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteCoordinatorNote(kind!, todayIsoLocal()),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });

  const busy = saveMut.isPending || deleteMut.isPending;
  const error = saveMut.error ?? deleteMut.error;

  const confirmDelete = () =>
    Alert.alert('Удалить запись?', 'Её перестанут показывать в приложении.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteMut.mutate() },
    ]);

  return (
    <Modal visible={kind != null} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{kind ? TITLES[kind] : ''}</Text>
            <Pressable
              onPress={onClose}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Закрыть"
              style={styles.closeBtn}
            >
              <Text style={styles.closeText}>Закрыть</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.hint}>
              Текст и срок показа. Пустое поле при сохранении убирает блок.
            </Text>

            {current.isLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Text style={styles.label}>Текст</Text>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  multiline
                  maxLength={MAX_LENGTH}
                  textAlignVertical="top"
                  placeholder={
                    kind === 'urgent_prayer' ? 'За кого или о чём молимся' : 'Текст объявления'
                  }
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  accessibilityLabel="Текст записи"
                />
                <Text style={styles.counter}>
                  {text.length} / {MAX_LENGTH}
                </Text>

                <Text style={styles.label}>Сколько показывать</Text>
                <View style={{ gap: 8 }}>
                  {DURATIONS.map((d) => {
                    const on = duration === d.id;
                    return (
                      <Pressable
                        key={d.id}
                        onPress={() => setDuration(d.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        style={[styles.radio, on && styles.radioOn]}
                      >
                        <View style={[styles.dot, on && styles.dotOn]} />
                        <Text style={styles.radioText}>{d.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {error ? (
              <Text style={styles.error}>
                Не удалось сохранить: {formatApiError(error)}. Попробуйте ещё раз.
              </Text>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            {existing ? (
              <Pressable
                onPress={confirmDelete}
                disabled={busy}
                accessibilityRole="button"
                style={({ pressed }) => [styles.btn, styles.btnDanger, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.btnDangerText}>Удалить</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => saveMut.mutate()}
              disabled={busy || current.isLoading}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.btn,
                styles.btnPrimary,
                (busy || pressed) && { opacity: 0.8 },
              ]}
            >
              {saveMut.isPending ? (
                <ActivityIndicator color={colors.textOnPrimary} />
              ) : (
                <Text style={styles.btnPrimaryText}>Сохранить</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 12,
    },
    title: { flex: 1, fontSize: 20, fontWeight: '800', color: colors.text },
    closeBtn: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 },
    closeText: { fontSize: 16, fontWeight: '700', color: colors.primary },
    content: { padding: 16, gap: 8 },
    hint: { fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginBottom: 8 },
    label: { fontSize: 14, fontWeight: '800', color: colors.textSecondary, marginTop: 8 },
    input: {
      minHeight: 160,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.textMuted + '88',
      backgroundColor: colors.surfaceElevated,
      padding: 14,
      fontSize: 17,
      lineHeight: 25,
      color: colors.text,
    },
    counter: { alignSelf: 'flex-end', fontSize: 13, color: colors.textSecondary },
    radio: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.textMuted + '66',
      backgroundColor: colors.surfaceElevated,
    },
    radioOn: { borderColor: colors.primary, backgroundColor: colors.primary + '14' },
    dot: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.textMuted,
    },
    dotOn: { borderColor: colors.primary, backgroundColor: colors.primary },
    radioText: { fontSize: 17, fontWeight: '600', color: colors.text },
    error: { fontSize: 15, color: '#B42318', marginTop: 8 },
    footer: { flexDirection: 'row', gap: 10, padding: 16 },
    btn: {
      flex: 1,
      minHeight: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnPrimary: { backgroundColor: colors.primary },
    btnPrimaryText: { fontSize: 17, fontWeight: '800', color: colors.textOnPrimary },
    btnDanger: { borderWidth: 1, borderColor: '#B42318' },
    btnDangerText: { fontSize: 17, fontWeight: '800', color: '#B42318' },
  });
}
