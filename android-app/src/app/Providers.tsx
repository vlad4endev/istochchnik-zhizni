import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import type {ReactNode} from 'react';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {AppNavigation} from './Navigation';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      networkMode: 'offlineFirst',
    },
  },
});

export function AppProviders({children}: {children?: ReactNode}) {
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>{children ?? <AppNavigation />}</QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
