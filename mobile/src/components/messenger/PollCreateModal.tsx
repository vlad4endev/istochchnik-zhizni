import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatApiError } from '../../api/client';
import { sendMessage } from '../../api/messenger';
import {
  POLL_MAX_OPTION,
  POLL_MAX_OPTIONS,
  POLL_MAX_QUESTION,
  POLL_MIN_OPTIONS,
  checkPollDraft,
} from '../../lib/polls';
import { useTheme, type ThemeColors } from '../../theme';

type Props = { visible: boolean; conversationId: string; onClose: () => void };

/** Создание опроса: вопрос, 2–10 вариантов, несколько ответов, анонимность. */
export function PollCreateModal({ visible, conversationId, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const qc = useQueryClient();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (visible) {
      setQuestion('');
      setOptions(['', '']);
      setMultiple(false);
      setAnonymous(false);
      setShowErrors(false);
    }
  }, [visible]);

  const check = checkPollDraft(question, options);

  const send = useMutation({
    mutationFn: async () => {
      if (!check.ok) throw new Error(check.error);
      await sendMessage(conversationId, check.question, undefined, null, {
        payloadType: 'poll',
        payload: { options: check.options, allows_multiple: multiple, anonymous },
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['messenger', 'messages', conversationId] });
      void qc.invalidateQueries({ queryKey: ['messenger', 'conversations'] });
      onClose();
    },
  });

  const setOption = (i: number, v: string) => setOptions((prev) => prev.map((o, idx) => (idx === i ? v : o)));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.head}>
            <Text style={styles.title}>Новый опрос</Text>
            <Pressable onPress={onClose} disabled={send.isPending} accessibilityRole="button" style={styles.close}>
              <Text style={styles.closeText}>Отмена</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Вопрос</Text>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              maxLength={POLL_MAX_QUESTION}
              multiline
              placeholder="Например: когда собираемся на молитву?"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.question]}
              accessibilityLabel="Вопрос опроса"
              textAlignVertical="top"
            />

            <Text style={styles.label}>Варианты ответа</Text>
            {options.map((o, i) => (
              <View key={i} style={styles.optRow}>
                <TextInput
                  value={o}
                  onChangeText={(v) => setOption(i, v)}
                  maxLength={POLL_MAX_OPTION}
                  placeholder={`Вариант ${i + 1}`}
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { flex: 1 }]}
                  accessibilityLabel={`Вариант ${i + 1}`}
                />
                {options.length > POLL_MIN_OPTIONS ? (
                  <Pressable
                    onPress={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
                    accessibilityRole="button"
                    accessibilityLabel={`Удалить вариант ${i + 1}`}
                    style={styles.delBtn}
                  >
                    <Ionicons name="close-circle" size={26} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {options.length < POLL_MAX_OPTIONS ? (
              <Pressable
                onPress={() => setOptions((prev) => [...prev, ''])}
                accessibilityRole="button"
                style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]}
              >
                <Ionicons name="add-circle" size={24} color={colors.primary} />
                <Text style={styles.addText}>Добавить вариант</Text>
              </Pressable>
            ) : (
              <Text style={styles.hint}>Достигнут максимум — {POLL_MAX_OPTIONS} вариантов.</Text>
            )}

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchTitle}>Несколько ответов</Text>
                <Text style={styles.hint}>Участники смогут выбрать больше одного варианта</Text>
              </View>
              <Switch value={multiple} onValueChange={setMultiple} accessibilityLabel="Несколько ответов" />
            </View>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchTitle}>Анонимный опрос</Text>
                <Text style={styles.hint}>Не будет видно, кто как проголосовал</Text>
              </View>
              <Switch value={anonymous} onValueChange={setAnonymous} accessibilityLabel="Анонимный опрос" />
            </View>

            {showErrors && !check.ok ? <Text style={styles.error}>{check.error}</Text> : null}
            {send.isError ? <Text style={styles.error}>Не удалось отправить: {formatApiError(send.error)}</Text> : null}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              onPress={() => (check.ok ? send.mutate() : setShowErrors(true))}
              disabled={send.isPending}
              accessibilityRole="button"
              style={[styles.sendBtn, (!check.ok || send.isPending) && { opacity: 0.6 }]}
            >
              {send.isPending ? (
                <ActivityIndicator color={colors.textOnPrimary} />
              ) : (
                <Text style={styles.sendText}>Отправить опрос</Text>
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
    head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
    title: { flex: 1, fontSize: 20, fontWeight: '800', color: colors.text },
    close: { minHeight: 48, justifyContent: 'center' },
    closeText: { fontSize: 16, fontWeight: '700', color: colors.primary },
    content: { padding: 16, gap: 10 },
    label: { fontSize: 14, fontWeight: '800', color: colors.textSecondary, marginTop: 6 },
    input: {
      minHeight: 52,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.textMuted + '88',
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: 14,
      fontSize: 17,
      color: colors.text,
    },
    question: { minHeight: 96, paddingTop: 12, lineHeight: 24 },
    optRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    delBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    addBtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 },
    addText: { fontSize: 17, fontWeight: '700', color: colors.primary },
    hint: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      minHeight: 68,
      borderRadius: 14,
      backgroundColor: colors.surfaceElevated,
    },
    switchTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    error: { fontSize: 15, color: '#B42318' },
    footer: { padding: 16 },
    sendBtn: {
      minHeight: 54,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendText: { fontSize: 17, fontWeight: '800', color: colors.textOnPrimary },
  });
}
