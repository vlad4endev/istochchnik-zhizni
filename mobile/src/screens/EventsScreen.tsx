import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { format, isToday, isTomorrow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
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
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { ScreenHeader } from '../components/ScreenHeader';
import {
  listUpcomingOccurrencesGrouped,
  uniqueEventCategories,
  type CalendarOccurrence,
} from '../lib/eventSchedule';
import { resolvePublicUrl } from '../lib/resolvePublicUrl';
import { useTheme, type ThemeColors } from '../theme';

const ACCENT_COLORS = ['#059669', '#0d9488', '#6366f1', '#d97706', '#e11d48', '#7c3aed'];

function daySectionTitle(day: Date): string {
  if (isToday(day)) return 'Сегодня';
  if (isTomorrow(day)) return 'Завтра';
  return format(day, 'EEEE, d MMMM', { locale: ru });
}

function formatEventTime(startsAt: Date): string {
  return format(startsAt, 'HH:mm');
}

function recurrenceLabel(item: CalendarOccurrence['item']): string | null {
  if (item.recurrence_type === 'weekly') {
    return 'Еженедельно';
  }
  return 'Разовое';
}

function EventOccurrenceCard({
  occurrence,
  accentColor,
}: {
  occurrence: CalendarOccurrence;
  accentColor: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createCardStyles(colors, accentColor), [colors, accentColor]);
  const { item, startsAt } = occurrence;
  const poster = resolvePublicUrl(item.poster_url);
  const recurrence = recurrenceLabel(item);

  return (
    <View style={styles.card}>
      <View style={styles.stripe} />
      <View style={styles.inner}>
        <View style={styles.row}>
          {poster ? (
            <Image source={{ uri: poster }} style={styles.poster} contentFit="cover" />
          ) : (
            <View style={styles.posterPlaceholder}>
              <Ionicons name="calendar" size={22} color={accentColor} />
            </View>
          )}
          <View style={styles.meta}>
            <Text style={styles.title}>{item.title}</Text>
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={15} color={colors.textMuted} />
              <Text style={styles.time}>{formatEventTime(startsAt)}</Text>
              {recurrence ? <Text style={styles.recurrence}>· {recurrence}</Text> : null}
            </View>
            {item.category ? (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{item.category}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {item.description?.trim() ? (
          <Text style={styles.description} numberOfLines={4}>
            {item.description.trim()}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function EventsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [category, setCategory] = useState<string | null>(null);

  const eventsQuery = useQuery({
    queryKey: ['events'],
    queryFn: fetchActiveEvents,
  });

  const overridesQuery = useQuery({
    queryKey: ['events', 'overrides'],
    queryFn: fetchOccurrenceOverrides,
  });

  const events = eventsQuery.data ?? [];
  const categories = useMemo(() => uniqueEventCategories(events), [events]);

  const filteredEvents = useMemo(() => {
    if (!category) return events;
    return events.filter((e) => (e.category?.trim() ?? '') === category);
  }, [events, category]);

  const groups = useMemo(
    () =>
      listUpcomingOccurrencesGrouped(
        filteredEvents,
        overridesQuery.data,
        42,
      ),
    [filteredEvents, overridesQuery.data],
  );

  const totalCount = groups.reduce((n, g) => n + g.items.length, 0);
  const isLoading = eventsQuery.isPending || overridesQuery.isPending;
  const isError = eventsQuery.isError || overridesQuery.isError;
  const error =
    (eventsQuery.error as Error | undefined) ??
    (overridesQuery.error as Error | undefined);

  const refresh = () => {
    void eventsQuery.refetch();
    void overridesQuery.refetch();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader
        title="События"
        subtitle={totalCount > 0 ? `${totalCount} ближайших встреч` : 'Расписание церкви'}
      />

      {categories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          <Pressable
            onPress={() => setCategory(null)}
            style={[styles.filterChip, !category && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, !category && styles.filterTextActive]}>Все</Text>
          </Pressable>
          {categories.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              style={[styles.filterChip, category === c && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, category === c && styles.filterTextActive]}>
                {c}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={
              (eventsQuery.isFetching || overridesQuery.isFetching) && !isLoading
            }
            onRefresh={refresh}
            tintColor={colors.primary}
          />
        }
      >
        {isLoading ? <LoadingView label="Загрузка расписания…" /> : null}

        {isError ? (
          <ErrorView
            message={error instanceof Error ? error.message : 'Ошибка загрузки'}
            onRetry={refresh}
          />
        ) : null}

        {!isLoading && !isError && groups.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={44} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Нет предстоящих событий</Text>
            <Text style={styles.emptyBody}>
              Расписание появится здесь, когда администратор добавит события.
            </Text>
          </View>
        ) : null}

        {groups.map((group) => (
          <View key={group.dayKey} style={styles.section}>
            <Text style={styles.sectionTitle}>{daySectionTitle(group.day)}</Text>
            {group.items.map((occ) => (
              <EventOccurrenceCard
                key={`${occ.item.id}-${group.dayKey}`}
                occurrence={occ}
                accentColor={ACCENT_COLORS[occ.item.id % ACCENT_COLORS.length] ?? colors.primary}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    filters: {
      paddingHorizontal: 16,
      paddingBottom: 8,
      gap: 8,
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.08)',
      marginRight: 8,
    },
    filterChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    filterTextActive: {
      color: colors.textOnPrimary,
    },
    content: {
      paddingHorizontal: 16,
      paddingBottom: 32,
    },
    section: {
      marginBottom: 20,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text,
      marginBottom: 10,
      textTransform: 'capitalize',
    },
    empty: {
      alignItems: 'center',
      paddingVertical: 56,
      paddingHorizontal: 24,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    emptyBody: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
  });
}

function createCardStyles(colors: ThemeColors, accentColor: string) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      marginBottom: 10,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.06)',
      shadowColor: '#1c1917',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 10,
      elevation: 2,
    },
    stripe: {
      width: 4,
      backgroundColor: accentColor,
    },
    inner: {
      flex: 1,
      padding: 14,
      gap: 10,
    },
    row: {
      flexDirection: 'row',
      gap: 12,
    },
    poster: {
      width: 56,
      height: 56,
      borderRadius: 12,
    },
    posterPlaceholder: {
      width: 56,
      height: 56,
      borderRadius: 12,
      backgroundColor: `${accentColor}14`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    meta: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    title: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text,
      lineHeight: 21,
    },
    timeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flexWrap: 'wrap',
    },
    time: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    recurrence: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: '600',
    },
    categoryBadge: {
      alignSelf: 'flex-start',
      backgroundColor: `${accentColor}14`,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      marginTop: 2,
    },
    categoryText: {
      fontSize: 11,
      fontWeight: '700',
      color: accentColor,
    },
    description: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
    },
  });
}
