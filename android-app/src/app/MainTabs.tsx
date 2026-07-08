import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {Text, View} from 'react-native';

import {SongbookListScreen} from '../screens/songbook/SongbookListScreen';
import {useAuthStore} from '../shared/auth/authStore';
import {Button} from '../components/ui/Button';
import {Screen} from '../components/ui/Screen';
import type {MainTabParamList} from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

function SettingsScreen() {
  const logout = useAuthStore(s => s.logout);
  const firstName = useAuthStore(s => s.firstName);
  const lastName = useAuthStore(s => s.lastName);

  return (
    <Screen>
      <View className="gap-4">
        <Text className="text-2xl font-bold text-stone-900">Настройки</Text>
        <Text className="text-base text-stone-600">
          {firstName} {lastName}
        </Text>
        <Button title="Выйти" onPress={() => void logout()} />
      </View>
    </Screen>
  );
}

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#7d3640',
      }}>
      <Tab.Screen name="Songbook" component={SongbookListScreen} options={{title: 'Песенник'}} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{title: 'Настройки'}} />
    </Tab.Navigator>
  );
}
