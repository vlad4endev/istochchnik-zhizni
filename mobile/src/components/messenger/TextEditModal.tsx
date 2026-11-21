import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme, type ThemeColors } from '../../theme';

type Props = {
  visible: boolean;
  title: string;
  initial: string;
  maxLength: number;
  multiline?: boolean;
  /** Пустое значение запрещено (название); для описания можно очистить. */
  required?: boolean;
  saving?: boolean;
  error?: string | null;
  onSave: (value: string) => void;
  onClose: () => void;
};

/** Полноэкранный редактор одной строки/абзаца: название и описание чата. */
export function TextEditModal({
  visible,
  title,
  initial,
  maxLength,
  multiline,
  required,
  saving,
  error,
  onSave,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (visible) setValue(initial);
  }, [visible, initial]);
  const trimmed = value.trim();
  const canSave = !saving && (!required || trimmed.length > 0) && trimmed !== initial.trim();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.head}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} disabled={saving} accessibilityRole="button" style={styles.close}>
              <Text style={styles.closeText}>Отмена</Text>
            </Pressable>
          </View>
          <View style={styles.body}>
            <TextInput
              value={value}
              onChangeText={setValue}
              maxLength={maxLength}
              multiline={multiline}
              autoFocus
              accessibilityLabel={title}
              placeholderTextColor={colors.textMuted}
              style={[styles.input, multiline && styles.inputMulti]}
              textAlignVertical={multiline ? 'top' : 'center'}
            />
            <Text style={styles.counter}>
              {value.length} / {maxLength}
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
          <View style={styles.footer}>
            <Pressable
              onPress={() => onSave(trimmed)}
              disabled={!canSave}
              accessibilityRole="button"
              style={[styles.saveBtn, !canSave && { opacity: 0.5 }]}
            >
              {saving ? (
                <ActivityIndicator color={colors.textOnPrimary} />
              ) : (
                <Text style={styles.saveText}>Сохранить</Text>
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
    head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
    title: { flex: 1, fontSize: 20, fontWeight: '800', color: colors.text },
    close: { minHeight: 48, justifyContent: 'center' },
    closeText: { fontSize: 16, fontWeight: '700', color: colors.primary },
    body: { flex: 1, padding: 16, gap: 8 },
    input: {
      minHeight: 54,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.textMuted + '88',
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: 14,
      fontSize: 18,
      color: colors.text,
    },
    inputMulti: { minHeight: 140, paddingTop: 12, lineHeight: 26 },
    counter: { alignSelf: 'flex-end', fontSize: 13, color: colors.textSecondary },
    error: { fontSize: 15, color: '#B42318' },
    footer: { padding: 16 },
    saveBtn: {
      minHeight: 54,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveText: { fontSize: 17, fontWeight: '800', color: colors.textOnPrimary },
  });
}
