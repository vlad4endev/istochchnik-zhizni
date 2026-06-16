import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { isActiveMember, useAuthStore } from '../stores/authStore';
import { useTheme } from '../theme';
import { AuthNavigator } from './AuthNavigator';
import { MainStack } from './MainTabs';

export function RootNavigator() {
  const { colors, isDark } = useTheme();
  const hydrated = useAuthStore((s) => s.hydrated);
  const token = useAuthStore((s) => s.token);
  const registrationStatus = useAuthStore((s) => s.registrationStatus);
  const hydrate = useAuthStore((s) => s.hydrate);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (token) {
      void refreshProfile();
    }
  }, [token, refreshProfile]);

  const navTheme = isDark
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          primary: colors.primary,
          background: colors.surface,
          card: colors.surfaceElevated,
          text: colors.text,
          border: 'rgba(255,255,255,0.1)',
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          primary: colors.primary,
          background: colors.surface,
          card: colors.surfaceElevated,
          text: colors.text,
          border: 'rgba(28,25,23,0.1)',
        },
      };

  if (!hydrated) {
    return (
      <View style={[styles.boot, { backgroundColor: colors.surface }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const showMain = Boolean(token) && isActiveMember(registrationStatus);
  const authInitial = token ? 'PendingReview' : 'Login';

  return (
    <NavigationContainer theme={navTheme}>
      {showMain ? <MainStack /> : <AuthNavigator initialRouteName={authInitial} />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
