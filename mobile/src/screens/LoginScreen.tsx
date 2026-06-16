import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { resolveApiOrigin } from '../lib/config';
import { formatRuPhoneInput, phoneToApiFormat } from '../lib/phone';
import { useAuthStore } from '../stores/authStore';
import { useTheme } from '../theme';

export function LoginScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const login = useAuthStore((s) => s.login);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    const phoneApi = phoneToApiFormat(phone);
    if (phoneApi.replace(/\D/g, '').length < 11) {
      setError('Введите номер телефона полностью.');
      return;
    }
    if (!password.trim()) {
      setError('Введите пароль.');
      return;
    }
    setLoading(true);
    const result = await login(phoneApi, password);
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.hero}>
          <View style={styles.logoCircle}>
            <Ionicons name="heart" size={36} color={colors.textOnPrimary} />
          </View>
          <Text style={styles.brand}>Источник жизни</Text>
          <Text style={styles.tagline}>Молитва, служение, община</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Телефон</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={(t) => setPhone(formatRuPhoneInput(t))}
            placeholder="+7 (___) ___-__-__"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
          />

          <Text style={styles.label}>Пароль</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!showPassword}
              autoComplete="password"
              textContentType="password"
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              style={styles.eyeBtn}
              accessibilityLabel={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color={colors.textMuted}
              />
            </Pressable>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={18} color="#b91c1c" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => void onSubmit()}
            disabled={loading}
            style={({ pressed }) => [
              styles.submit,
              (pressed || loading) && styles.submitPressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.submitText}>Войти</Text>
            )}
          </Pressable>

          <Text style={styles.apiHint}>API: {resolveApiOrigin()}</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    flex: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    hero: {
      alignItems: 'center',
      marginBottom: 40,
    },
    logoCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    brand: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.5,
    },
    tagline: {
      fontSize: 15,
      color: colors.textSecondary,
      marginTop: 6,
    },
    form: {
      gap: 8,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginTop: 8,
      marginBottom: 4,
    },
    input: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.1)',
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.text,
    },
    passwordRow: {
      position: 'relative',
    },
    passwordInput: {
      paddingRight: 48,
    },
    eyeBtn: {
      position: 'absolute',
      right: 12,
      top: 12,
      padding: 4,
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#fef2f2',
      borderRadius: 10,
      padding: 12,
      marginTop: 8,
    },
    errorText: {
      flex: 1,
      color: '#b91c1c',
      fontSize: 14,
    },
    submit: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 16,
    },
    submitPressed: {
      backgroundColor: colors.primaryDark,
    },
    submitText: {
      color: colors.textOnPrimary,
      fontSize: 17,
      fontWeight: '700',
    },
    apiHint: {
      textAlign: 'center',
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 24,
    },
  });
}
