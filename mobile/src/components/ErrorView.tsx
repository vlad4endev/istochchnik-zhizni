import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme';

interface ErrorViewProps {
  title?: string;
  message: string;
  hint?: string;
  onRetry?: () => void;
}

export function ErrorView({
  title = 'Не удалось загрузить данные',
  message,
  hint,
  onRetry,
}: ErrorViewProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        >
          <Text style={styles.btnText}>Повторить</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      padding: 24,
      marginVertical: 8,
      alignItems: 'center',
    },
    title: {
      fontWeight: '700',
      fontSize: 16,
      color: colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    message: {
      color: colors.textSecondary,
      fontSize: 14,
      textAlign: 'center',
      marginBottom: 8,
    },
    hint: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: 16,
    },
    btn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 12,
      marginTop: 8,
    },
    btnPressed: {
      backgroundColor: colors.primaryDark,
    },
    btnText: {
      color: colors.textOnPrimary,
      fontWeight: '700',
      fontSize: 15,
    },
  });
}
