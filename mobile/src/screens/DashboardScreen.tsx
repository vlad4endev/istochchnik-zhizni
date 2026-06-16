import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { format, isToday, isTomorrow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useMemo } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchActiveEvents, fetchOccurrenceOverrides } from '../api/events';
import { fetchUnreadCount } from '../api/messenger';
import { fetchPrayerByDate } from '../api/prayer';
import { fetchPodcastFeed } from '../api/resources';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { ScreenHeader } from '../components/ScreenHeader';
import { formatDisplayDate, todayIsoUtc } from '../lib/date';
import { pickFirstUpcomingOccurrence } from '../lib/eventSchedule';
import { memberRosterName } from '../lib/memberRosterName';
import { roleLabelRu } from '../lib/roleLabels';
import { useMediaScheduleAccess } from '../hooks/useMediaScheduleAccess';
import { useServicePlannerAccess } from '../hooks/useServicePlannerAccess';
import { useStudioAccess } from '../hooks/useStudioAccess';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { useAuthDisplayName, useAuthStore } from '../stores/authStore';
import { useTheme, type ThemeColors } from '../theme';

type DashboardNav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Dashboard'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type QuickActionDef = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: (nav: DashboardNav) => void;
  badge?: number;
  hidden?: boolean;
};

function eventWhenLabel(date: Date): string {
  if (isToday(date)) return 'Сегодня';
  if (isTomorrow(date)) return 'Завтра';
  return format(date, 'EEEE, d MMMM', { locale: ru });
}

export function DashboardScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<DashboardNav>();
  const displayName = useAuthDisplayName();
  const role = useAuthStore((s) => s.role);
  const isParishioner = role === 'parishioner';
  const { canView: canViewMediaSchedule } = useMediaScheduleAccess();
  const { canView: canViewServicePlanner } = useServicePlannerAccess();
  const { canView: canViewStudio } = useStudioAccess();
  const today = todayIsoUtc();

  const prayerQuery = useQuery({
    queryKey: ['prayer', today],
    queryFn: () => fetchPrayerByDate(today),
  });

  const eventsQuery = useQuery({
    queryKey: ['events'],
    queryFn: fetchActiveEvents,
  });

  const overridesQuery = useQuery({
    queryKey: ['events', 'overrides'],
    queryFn: fetchOccurrenceOverrides,
  });

  const sermonsQuery = useQuery({
    queryKey: ['podcasts', 'dashboard'],
    queryFn: () => fetchPodcastFeed({ limit: 5 }),
  });

  const unreadQuery = useQuery({
    queryKey: ['messenger', 'unread'],
    queryFn: fetchUnreadCount,
    refetchInterval: 60_000,
  });

  const todayLabel = format(new Date(), 'EEEE, d MMMM', { locale: ru });
  const member = prayerQuery.data?.members[0];
  const theme = prayerQuery.data?.global_themes[0];
  const unreadCount = unreadQuery.data ?? 0;

  const nextEvent = useMemo(() => {
    if (!eventsQuery.data) return null;
    return pickFirstUpcomingOccurrence(
      eventsQuery.data,
      overridesQuery.data,
      new Date(),
    );
  }, [eventsQuery.data, overridesQuery.data]);

  const latestEpisode = sermonsQuery.data?.episodes[0] ?? null;

  const quickActions = useMemo((): QuickActionDef[] => {
    const items: QuickActionDef[] = [
      {
        id: 'events',
        icon: 'calendar-outline',
        label: 'Расписание',
        color: '#0F6636',
        onPress: (nav) => nav.navigate('Events'),
      },
      {
        id: 'prayer',
        icon: 'heart-outline',
        label: isParishioner ? 'Молитва' : 'Нужда',
        color: colors.primary,
        onPress: (nav) => nav.navigate('Prayer'),
        hidden: false,
      },
      {
        id: 'sermons',
        icon: 'mic-outline',
        label: 'Проповеди',
        color: '#0A5A4C',
        onPress: (nav) => nav.navigate('Sermons'),
      },
      {
        id: 'chats',
        icon: 'chatbubbles-outline',
        label: 'Чаты',
        color: '#2563eb',
        onPress: (nav) => nav.navigate('Chats'),
        badge: unreadCount,
      },
      {
        id: 'songbook',
        icon: 'musical-notes-outline',
        label: 'Песенник',
        color: '#ea580c',
        onPress: (nav) => nav.navigate('Songbook'),
      },
    ];

    if (canViewServicePlanner) {
      items.push({
        id: 'planner',
        icon: 'list-outline',
        label: 'Служение',
        color: '#7c3aed',
        onPress: (nav) => nav.navigate('ServicePlanner'),
      });
    }
    if (canViewMediaSchedule) {
      items.push({
        id: 'media',
        icon: 'videocam-outline',
        label: 'Медиа',
        color: '#4f46e5',
        onPress: (nav) => nav.navigate('MediaSchedule'),
      });
    }
    if (canViewStudio) {
      items.push({
        id: 'studio',
        icon: 'disc-outline',
        label: 'Студия',
        color: '#db2777',
        onPress: (nav) => nav.navigate('Studio'),
      });
    }

    return items.filter((a) => !a.hidden);
  }, [
    canViewMediaSchedule,
    canViewServicePlanner,
    canViewStudio,
    colors.primary,
    isParishioner,
    unreadCount,
  ]);

  const initials = useMemo(() => {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
    }
    return (displayName[0] ?? '?').toUpperCase();
  }, [displayName]);

  const refreshing =
    prayerQuery.isFetching ||
    eventsQuery.isFetching ||
    sermonsQuery.isFetching;

  const onRefresh = () => {
    void prayerQuery.refetch();
    void eventsQuery.refetch();
    void overridesQuery.refetch();
    void sermonsQuery.refetch();
    void unreadQuery.refetch();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader
        title={displayName ? `Здравствуйте, ${displayName.split(' ')[0]}` : 'Главная'}
        subtitle={todayLabel}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Pressable
          onPress={() => navigation.navigate('Settings')}
          style={({ pressed }) => [styles.profileCard, pressed && { opacity: 0.92 }]}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileMeta}>
            <Text style={styles.profileName}>{displayName || 'Участник'}</Text>
            <Text style={styles.profileRole}>{roleLabelRu(role)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>

        <Text style={styles.sectionTitle}>Разделы</Text>
        <View style={styles.quickGrid}>
          {quickActions.map((action) => (
            <QuickAction
              key={action.id}
              icon={action.icon}
              label={action.label}
              color={action.color}
              badge={action.badge}
              onPress={() => action.onPress(navigation)}
            />
          ))}
        </View>

        {nextEvent ? (
          <>
            <Text style={styles.sectionTitle}>Ближайшее событие</Text>
            <Pressable
              onPress={() => navigation.navigate('Events')}
              style={({ pressed }) => [styles.card, styles.eventCard, pressed && { opacity: 0.92 }]}
            >
              <View style={styles.eventStripe} />
              <View style={styles.eventInner}>
                <Text style={styles.eventWhen}>{eventWhenLabel(nextEvent.startsAt)}</Text>
                <Text style={styles.cardTitle}>{nextEvent.item.title}</Text>
                <Text style={styles.eventTime}>
                  {format(nextEvent.startsAt, 'HH:mm')}
                  {nextEvent.item.category ? ` · ${nextEvent.item.category}` : ''}
                </Text>
                {nextEvent.item.description?.trim() ? (
                  <Text style={styles.cardBody} numberOfLines={2}>
                    {nextEvent.item.description.trim()}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          </>
        ) : null}

        {!isParishioner ? (
          <>
            <Text style={styles.sectionTitle}>Молитва сегодня</Text>
            {prayerQuery.isLoading ? <LoadingView /> : null}
            {prayerQuery.isError ? (
              <ErrorView
                message={
                  prayerQuery.error instanceof Error ? prayerQuery.error.message : 'Ошибка'
                }
                onRetry={() => void prayerQuery.refetch()}
              />
            ) : null}
            {prayerQuery.data ? (
              <Pressable
                onPress={() => navigation.navigate('Prayer')}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
              >
                <Text style={styles.cardLabel}>Член церкви</Text>
                <Text style={styles.cardTitle}>
                  {member ? memberRosterName(member) : 'Не назначен'}
                </Text>
                <Text style={styles.cardBody} numberOfLines={3}>
                  {(member?.prayer_request?.trim() || 'Нужда не указана').trim()}
                </Text>
                {theme?.title ? (
                  <>
                    <View style={styles.divider} />
                    <Text style={styles.cardLabel}>Тема дня</Text>
                    <Text style={styles.cardTitle}>{theme.title}</Text>
                  </>
                ) : null}
                <Text style={styles.dateFoot}>{formatDisplayDate(today)}</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        {latestEpisode ? (
          <>
            <Text style={styles.sectionTitle}>Проповеди</Text>
            <Pressable
              onPress={() => navigation.navigate('Sermons')}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
            >
              <View style={styles.sermonRow}>
                <View style={styles.sermonIcon}>
                  <Ionicons name="mic" size={22} color="#0A5A4C" />
                </View>
                <View style={styles.sermonMeta}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {latestEpisode.title}
                  </Text>
                  {sermonsQuery.data?.feed.title ? (
                    <Text style={styles.sermonFeed} numberOfLines={1}>
                      {sermonsQuery.data.feed.title}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="play-circle-outline" size={32} color={colors.primary} />
              </View>
            </Pressable>
          </>
        ) : null}

        {eventsQuery.isLoading && !nextEvent ? (
          <View style={{ marginTop: 8 }}>
            <LoadingView />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({
  icon,
  label,
  color,
  badge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  badge?: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createQuickStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={22} color={color} />
        {badge != null && badge > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function createQuickStyles(colors: ThemeColors) {
  return StyleSheet.create({
    tile: {
      width: '31%',
      minWidth: 100,
      flexGrow: 1,
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      paddingVertical: 14,
      paddingHorizontal: 8,
      alignItems: 'center',
      gap: 8,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badge: {
      position: 'absolute',
      top: -4,
      right: -8,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 4,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {
      fontSize: 9,
      fontWeight: '800',
      color: colors.textOnPrimary,
    },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
  });
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: 16,
      paddingBottom: 32,
      gap: 4,
    },
    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 8,
      shadowColor: '#1c1917',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 2,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: `${colors.primary}22`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.primary,
    },
    profileMeta: {
      flex: 1,
      minWidth: 0,
    },
    profileName: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.text,
    },
    profileRole: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 2,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      color: colors.textMuted,
      marginTop: 16,
      marginBottom: 8,
    },
    quickGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      padding: 20,
      shadowColor: '#1c1917',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.06,
      shadowRadius: 16,
      elevation: 2,
    },
    eventCard: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 0,
      overflow: 'hidden',
    },
    eventStripe: {
      width: 4,
      alignSelf: 'stretch',
      backgroundColor: '#059669',
      borderTopLeftRadius: colors.radius,
      borderBottomLeftRadius: colors.radius,
    },
    eventInner: {
      flex: 1,
      paddingLeft: 16,
      paddingRight: 8,
      minWidth: 0,
    },
    eventWhen: {
      fontSize: 12,
      fontWeight: '700',
      color: '#059669',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 4,
    },
    eventTime: {
      fontSize: 14,
      color: colors.textMuted,
      marginTop: 4,
      marginBottom: 4,
    },
    cardLabel: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.66,
      textTransform: 'uppercase',
      color: colors.textMuted,
      marginBottom: 6,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
      marginBottom: 4,
    },
    cardBody: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textSecondary,
    },
    divider: {
      height: 1,
      backgroundColor: 'rgba(28,25,23,0.08)',
      marginVertical: 16,
    },
    dateFoot: {
      marginTop: 12,
      fontSize: 12,
      color: colors.textMuted,
    },
    sermonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    sermonIcon: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: '#E6F4F1',
      alignItems: 'center',
      justifyContent: 'center',
    },
    sermonMeta: {
      flex: 1,
      minWidth: 0,
    },
    sermonFeed: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 4,
    },
  });
}
