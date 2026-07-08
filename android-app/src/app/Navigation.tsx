import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useEffect} from 'react';

import {Loading} from '../components/ui/Loading';
import {Screen} from '../components/ui/Screen';
import {AuthLandingScreen, LoginScreen} from '../screens/auth/AuthScreens';
import {OfflineScreen} from '../screens/OfflineScreen';
import {SongDetailScreen} from '../screens/songbook/SongDetailScreen';
import {useAuthStore} from '../shared/auth/authStore';
import {memberRepository} from '../repositories/MemberRepository';
import {useNetworkSync} from '../sync/useNetworkSync';
import {MainTabs} from './MainTabs';
import type {RootStackParamList} from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function BootstrapScreen() {
  const hydrate = useAuthStore(s => s.hydrateFromStorage);
  const hydrated = useAuthStore(s => s.hydrated);
  const token = useAuthStore(s => s.token);
  const memberId = useAuthStore(s => s.memberId);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated || !token || !memberId) return;
    const state = useAuthStore.getState();
    void memberRepository.upsertFromProfile({
      firstName: state.firstName,
      lastName: state.lastName,
      role: state.role,
      roles: state.roles,
      registrationStatus: state.registrationStatus,
      username: state.username,
      memberId: state.memberId,
    });
  }, [hydrated, token, memberId]);

  useNetworkSync(Boolean(token));

  if (!hydrated) {
    return (
      <Screen>
        <Loading label="Запуск…" />
      </Screen>
    );
  }

  return (
    <Stack.Navigator key={token ? 'app' : 'auth'} screenOptions={{headerTintColor: '#7d3640'}}>
      {token ? (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} options={{headerShown: false}} />
          <Stack.Screen name="SongDetail" component={SongDetailScreen} options={{title: 'Песня'}} />
          <Stack.Screen name="Offline" component={OfflineScreen} options={{title: 'Офлайн'}} />
        </>
      ) : (
        <>
          <Stack.Screen
            name="AuthLanding"
            component={AuthLandingScreen}
            options={{headerShown: false}}
          />
          <Stack.Screen name="Login" component={LoginScreen} options={{title: 'Вход'}} />
        </>
      )}
    </Stack.Navigator>
  );
}

export function AppNavigation() {
  return (
    <NavigationContainer>
      <BootstrapScreen />
    </NavigationContainer>
  );
}
