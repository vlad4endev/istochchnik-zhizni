import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {Text} from 'react-native';

import {HomeScreen} from '../screens/home/HomeScreen';
import {SongbookListScreen} from '../screens/songbook/SongbookListScreen';
import {FeedScreen} from '../screens/feed/FeedScreen';
import {MediaScheduleScreen} from '../screens/mediaSchedule/MediaScheduleScreen';
import {SettingsScreen} from '../screens/settings/SettingsScreen';
import type {MainTabParamList} from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

function TabLabel({label, focused}: {label: string; focused: boolean}) {
  return (
    <Text
      className={`text-[11px] ${focused ? 'font-semibold text-primary' : 'font-medium text-stone-500'}`}>
      {label}
    </Text>
  );
}

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#7d3640',
        tabBarInactiveTintColor: '#78716c',
        tabBarStyle: {
          backgroundColor: '#f4f1ed',
          borderTopColor: '#e7e5e4',
        },
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Главная',
          tabBarLabel: ({focused}) => <TabLabel label="Главная" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Songbook"
        component={SongbookListScreen}
        options={{
          title: 'Песенник',
          tabBarLabel: ({focused}) => <TabLabel label="Песни" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{
          title: 'Лента',
          tabBarLabel: ({focused}) => <TabLabel label="Лента" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="MediaSchedule"
        component={MediaScheduleScreen}
        options={{
          title: 'Медиа',
          tabBarLabel: ({focused}) => <TabLabel label="Медиа" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Ещё',
          tabBarLabel: ({focused}) => <TabLabel label="Ещё" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}
