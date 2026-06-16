import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Platform, Text, View } from 'react-native';

import { SermonPlayerBar } from '../components/SermonPlayerBar';
import { SermonPlayerProvider } from '../contexts/SermonPlayerContext';
import { fetchUnreadCount } from '../api/messenger';
import { DashboardScreen } from '../screens/DashboardScreen';
import { ChatsScreen } from '../screens/ChatsScreen';
import { ChatThreadScreen } from '../screens/ChatThreadScreen';
import { EventsScreen } from '../screens/EventsScreen';
import { MediaScheduleScreen } from '../screens/MediaScheduleScreen';
import { NewChatScreen } from '../screens/NewChatScreen';
import { PrayerCyclePlanScreen } from '../screens/PrayerCyclePlanScreen';
import { PrayerScreen } from '../screens/PrayerScreen';
import { SermonsScreen } from '../screens/SermonsScreen';
import { ServicePlannerScreen } from '../screens/ServicePlannerScreen';
import { ServicePlanDetailScreen } from '../screens/ServicePlanDetailScreen';
import { StudioPerformScreen } from '../screens/StudioPerformScreen';
import { StudioScreen } from '../screens/StudioScreen';
import { StudioSetlistDetailScreen } from '../screens/StudioSetlistDetailScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SongDetailScreen } from '../screens/SongDetailScreen';
import { SongbookScreen } from '../screens/SongbookScreen';
import { useTheme } from '../theme';
import type { MainTabParamList, RootStackParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

type TabIcon = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<keyof MainTabParamList, TabIcon> = {
  Dashboard: 'grid-outline',
  Chats: 'chatbubbles-outline',
  Prayer: 'heart-outline',
  Songbook: 'musical-notes-outline',
  Sermons: 'mic-outline',
  Settings: 'settings-outline',
};

const TAB_LABELS: Record<keyof MainTabParamList, string> = {
  Dashboard: 'Главная',
  Chats: 'Чаты',
  Prayer: 'Молитва',
  Songbook: 'Песенник',
  Sermons: 'Проповеди',
  Settings: 'Ещё',
};

function MainTabsInner() {
  const { colors, isDark } = useTheme();

  const unreadQuery = useQuery({
    queryKey: ['messenger', 'unread'],
    queryFn: fetchUnreadCount,
    refetchInterval: 60_000,
  });
  const unreadCount = unreadQuery.data ?? 0;

  const screenOptions = useMemo(
    () => ({
      headerShown: false as const,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarStyle: {
        backgroundColor: colors.surfaceElevated,
        borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(28,25,23,0.08)',
        paddingTop: 4,
        paddingBottom: Platform.OS === 'ios' ? 22 : 8,
        height: Platform.OS === 'ios' ? 84 : 60,
      },
      tabBarLabelStyle: {
        fontSize: 11,
        fontWeight: '600' as const,
      },
    }),
    [colors, isDark],
  );

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator screenOptions={screenOptions}>
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{
            tabBarLabel: TAB_LABELS.Dashboard,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name={TAB_ICONS.Dashboard} size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Chats"
          component={ChatsScreen}
          options={{
            tabBarLabel: TAB_LABELS.Chats,
            tabBarIcon: ({ color, size }) => (
              <TabIconWithBadge
                icon={TAB_ICONS.Chats}
                color={color}
                size={size}
                badge={unreadCount}
              />
            ),
          }}
        />
        <Tab.Screen
          name="Prayer"
          component={PrayerScreen}
          options={{
            tabBarLabel: TAB_LABELS.Prayer,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name={TAB_ICONS.Prayer} size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Songbook"
          component={SongbookScreen}
          options={{
            tabBarLabel: TAB_LABELS.Songbook,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name={TAB_ICONS.Songbook} size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Sermons"
          component={SermonsScreen}
          options={{
            tabBarLabel: TAB_LABELS.Sermons,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name={TAB_ICONS.Sermons} size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarLabel: TAB_LABELS.Settings,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name={TAB_ICONS.Settings} size={size} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
      <SermonPlayerBar />
    </View>
  );
}

function MainTabs() {
  return (
    <SermonPlayerProvider>
      <MainTabsInner />
    </SermonPlayerProvider>
  );
}

export function MainStack() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.textOnPrimary,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.surface },
      }}
    >
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SongDetail"
        component={SongDetailScreen}
        options={({ route }) => ({
          title: route.params.title,
        })}
      />
      <Stack.Screen
        name="Events"
        component={EventsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ChatThread"
        component={ChatThreadScreen}
        options={({ route }) => ({
          title: route.params.title ?? 'Чат',
        })}
      />
      <Stack.Screen
        name="NewChat"
        component={NewChatScreen}
        options={{ title: 'Новый чат' }}
      />
      <Stack.Screen
        name="MediaSchedule"
        component={MediaScheduleScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ServicePlanner"
        component={ServicePlannerScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ServicePlanDetail"
        component={ServicePlanDetailScreen}
        options={({ route }) => ({
          title: route.params.title ?? 'План служения',
        })}
      />
      <Stack.Screen
        name="Studio"
        component={StudioScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StudioSetlistDetail"
        component={StudioSetlistDetailScreen}
        options={({ route }) => ({
          title: route.params.title,
        })}
      />
      <Stack.Screen
        name="StudioPerform"
        component={StudioPerformScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="PrayerCyclePlan"
        component={PrayerCyclePlanScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

export { MainTabs };

function TabIconWithBadge({
  icon,
  color,
  size,
  badge,
}: {
  icon: TabIcon;
  color: string;
  size: number;
  badge: number;
}) {
  const { colors } = useTheme();
  return (
    <View>
      <Ionicons name={icon} size={size} color={color} />
      {badge > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -4,
            right: -10,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            paddingHorizontal: 4,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: '800', color: colors.textOnPrimary }}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
