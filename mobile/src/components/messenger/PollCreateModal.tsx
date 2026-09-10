import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useTheme, type ThemeColors } from '../../theme';

interface PollCreateModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: {
    question: string;
    options: string[];
    allowsMultiple: boolean;
    anonymous: boolean;
  }) => Promise<void>;
}

export function PollCreateModal({ visible, onClose, onSubmit }: PollCreateModalProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowsMultiple, setAllowsMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setQuestion('');
    setOptions(['', '']);
    setAllowsMultiple(false);
    setAnonymous(false);
    setError(null);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    const q = question.trim();
    const cleaned = options.map((o) => o.trim()).filter(Boolean);
    if (!q) {
      setError('Введите вопрос');
      return;
    }
    if (cleaned.length < 2) {
      setError('Нужно минимум 2 варианта');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        question: q,
        options: cleaned,
        allowsMultiple,
        anonymous,
      });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать опрос');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Новый опрос</Text>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Text style={styles.close}>Закрыть</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Вопрос</Text>
          <TextInput
            style={styles.input}
            value={question}
            onChangeText={setQuestion}
            placeholder="О чём спросить?"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Варианты</Text>
          {options.map((opt, index) => (
            <View key={index} style={styles.optionRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={opt}
                onChangeText={(v) =>
                  setOptions((prev) => prev.map((p, i) => (i === index ? v : p)))
                }
                placeholder={`Вариант ${index + 1}`}
                placeholderTextColor={colors.textMuted}
              />
              {options.length > 2 ? (
                <Pressable
                  onPress={() => setOptions((prev) => prev.filter((_, i) => i !== index))}
                  style={styles.removeOpt}
                >
                  <Text style={styles.removeOptText}>×</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
          {options.length < 10 ? (
            <Pressable
              onPress={() => setOptions((prev) => [...prev, ''])}
              style={styles.addOpt}
            >
              <Text style={styles.addOptText}>+ Добавить вариант</Text>
            </Pressable>
          ) : null}

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Несколько ответов</Text>
            <Switch value={allowsMultiple} onValueChange={setAllowsMultiple} />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Анонимно</Text>
            <Switch value={anonymous} onValueChange={setAnonymous} />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={() => void handleSubmit()}
            disabled={submitting}
            style={({ pressed }) => [
              styles.submit,
              pressed && { opacity: 0.9 },
              submitting && { opacity: 0.55 },
            ]}
          >
            <Text style={styles.submitText}>{submitting ? 'Создание…' : 'Создать опрос'}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(28,25,23,0.08)',
    },
    title: { fontSize: 18, fontWeight: '800', color: colors.text },
    close: { fontSize: 15, fontWeight: '600', color: colors.primary },
    content: { padding: 16, paddingBottom: 40 },
    label: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      marginBottom: 6,
      marginTop: 10,
      textTransform: 'uppercase',
    },
    input: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.1)',
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 15,
      color: colors.text,
      marginBottom: 8,
    },
    optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    removeOpt: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceElevated,
    },
    removeOptText: { fontSize: 22, color: colors.textMuted, marginTop: -2 },
    addOpt: { paddingVertical: 8 },
    addOptText: { color: colors.primary, fontWeight: '700' },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
    },
    switchLabel: { fontSize: 15, color: colors.text, fontWeight: '600' },
    error: { color: '#dc2626', marginTop: 8, fontWeight: '600' },
    submit: {
      marginTop: 18,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    submitText: { color: colors.textOnPrimary, fontWeight: '800', fontSize: 16 },
  });
}
