import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, UIManager } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MessengerWsProvider } from './src/contexts/MessengerWsContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useSettingsStore } from './src/stores/settingsStore';
import { useTheme } from './src/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

function AppInner() {
  const { isDark } = useTheme();
  const hydrateSettings = useSettingsStore((s) => s.hydrate);

  useEffect(() => {
    hydrateSettings();
  }, [hydrateSettings]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <MessengerWsProvider>
          <AppInner />
        </MessengerWsProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
