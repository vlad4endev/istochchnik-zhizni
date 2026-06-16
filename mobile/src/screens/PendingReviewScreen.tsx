import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthStore } from '../stores/authStore';
import { useTheme } from '../theme';

export function PendingReviewScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const registrationStatus = useAuthStore((s) => s.registrationStatus);
  const firstName = useAuthStore((s) => s.firstName);
  const logout = useAuthStore((s) => s.logout);

  const isRejected = registrationStatus === 'rejected';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <View style={[styles.iconWrap, isRejected && styles.iconWrapRejected]}>
          <Ionicons
            name={isRejected ? 'close-circle-outline' : 'time-outline'}
            size={48}
            color={isRejected ? '#b91c1c' : colors.primary}
          />
        </View>

        <Text style={styles.title}>
          {isRejected ? 'Регистрация отклонена' : 'Ожидает подтверждения'}
        </Text>

        {firstName ? (
          <Text style={styles.greeting}>Здравствуйте, {firstName}!</Text>
        ) : null}

        <Text style={styles.body}>
          {isRejected
            ? 'К сожалению, ваша заявка была отклонена. Обратитесь к администратору церкви.'
            : 'Ваша заявка на вступление отправлена. После одобрения администратором вы получите полный доступ к приложению.'}
        </Text>

        <Pressable
          onPress={() => void logout()}
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        >
          <Text style={styles.btnText}>Выйти</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      flex: 1,
      paddingHorizontal: 28,
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconWrap: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    iconWrapRejected: {
      backgroundColor: '#fef2f2',
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    greeting: {
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: 16,
    },
    body: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 32,
    },
    btn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 32,
      paddingVertical: 14,
      borderRadius: 12,
    },
    btnPressed: {
      backgroundColor: colors.primaryDark,
    },
    btnText: {
      color: colors.textOnPrimary,
      fontWeight: '700',
      fontSize: 16,
    },
  });
}
