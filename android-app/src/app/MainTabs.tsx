import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {Text, View} from 'react-native';

import {HomeScreen} from '../screens/home/HomeScreen';
import {SongbookListScreen} from '../screens/songbook/SongbookListScreen';
import {FeedScreen} from '../screens/feed/FeedScreen';
import {MediaScheduleScreen} from '../screens/mediaSchedule/MediaScheduleScreen';
import {SettingsScreen} from '../screens/settings/SettingsScreen';
import type {MainTabParamList} from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

function TabIcon({symbol, label, focused}: {symbol: string; label: string; focused: boolean}) {
  return (
    <View className="items-center pt-1">
      <Text className={`text-base ${focused ? 'opacity-100' : 'opacity-55'}`}>{symbol}</Text>
      <Text
        className={`mt-0.5 text-[10px] ${
          focused ? 'font-semibold text-primary' : 'font-medium text-stone-500'
        }`}>
        {label}
      </Text>
    </View>
  );
}

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: '#7d3640',
        tabBarInactiveTintColor: '#78716c',
        tabBarStyle: {
          backgroundColor: '#faf8f5',
          borderTopColor: '#e7e5e4',
          height: 62,
          paddingBottom: 6,
          paddingTop: 4,
        },
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({focused}) => <TabIcon symbol="⌂" label="Главная" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Songbook"
        component={SongbookListScreen}
        options={{
          tabBarIcon: ({focused}) => <TabIcon symbol="♪" label="Песни" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{
          tabBarIcon: ({focused}) => <TabIcon symbol="◎" label="Лента" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="MediaSchedule"
        component={MediaScheduleScreen}
        options={{
          tabBarIcon: ({focused}) => <TabIcon symbol="▷" label="Медиа" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({focused}) => <TabIcon symbol="☰" label="Ещё" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}
