import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
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

import { fetchPrayerByDate } from '../api/prayer';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import {
  BacksliderPrayerCard,
  MemberPrayerCard,
  MinistryPrayerCard,
  ThemePrayerCard,
} from '../components/prayer/PrayerDayCards';
import { ScreenHeader } from '../components/ScreenHeader';
import { usePrayerPlanAccess } from '../hooks/usePrayerPlanAccess';
import {
  addDaysIso,
  formatDisplayDateLong,
  isTodayIso,
  todayIsoUtc,
} from '../lib/date';
import { resolveApiOrigin } from '../lib/config';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import type { DayPrayerData } from '../types';
import { useTheme, type ThemeColors } from '../theme';

type PrayerNav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Prayer'>,
  NativeStackNavigationProp<RootStackParamList>
>;

function isPrayerEmpty(data: DayPrayerData): boolean {
  return (
    data.members.length === 0 &&
    data.global_themes.length === 0 &&
    data.ministries.length === 0 &&
    data.backsliders.length === 0
  );
}

export function PrayerScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<PrayerNav>();
  const { canManage: canManageCyclePlan } = usePrayerPlanAccess();
  const [date, setDate] = useState(todayIsoUtc);

  const prayerQuery = useQuery({
    queryKey: ['prayer', date],
    queryFn: () => fetchPrayerByDate(date),
  });

  const data = prayerQuery.data;
  const isToday = isTodayIso(date);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader
        title="Молитва"
        subtitle={isToday ? 'План на сегодня' : 'Ежедневный молитвенный план'}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={prayerQuery.isFetching && !prayerQuery.isPending}
            onRefresh={() => void prayerQuery.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {canManageCyclePlan ? (
          <Pressable
            onPress={() => navigation.navigate('PrayerCyclePlan')}
            style={({ pressed }) => [styles.cyclePlanBtn, pressed && { opacity: 0.92 }]}
          >
            <View style={styles.cyclePlanIcon}>
              <Ionicons name="clipboard-outline" size={20} color={colors.textOnPrimary} />
            </View>
            <View style={styles.cyclePlanMeta}>
              <Text style={styles.cyclePlanTitle}>Сбор нужд · очередь недели</Text>
              <Text style={styles.cyclePlanSub}>
                Распределение участников цикла и назначение кураторов
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}

        <View style={styles.dateCard}>
          <View style={styles.dateTop}>
            <Text style={styles.dateLabel}>Дата</Text>
            {!isToday ? (
              <Pressable
                onPress={() => setDate(todayIsoUtc())}
                style={({ pressed }) => [styles.todayBtn, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="today-outline" size={14} color={colors.primary} />
                <Text style={styles.todayBtnText}>Сегодня</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.dateControls}>
            <Pressable
              onPress={() => setDate((d) => addDaysIso(d, -1))}
              style={({ pressed }) => [styles.dateArrow, pressed && { opacity: 0.7 }]}
              accessibilityLabel="Предыдущий день"
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
            <View style={styles.dateCaptionWrap}>
              <Text style={styles.dateCaption}>{formatDisplayDateLong(date)}</Text>
            </View>
            <Pressable
              onPress={() => setDate((d) => addDaysIso(d, 1))}
              style={({ pressed }) => [styles.dateArrow, pressed && { opacity: 0.7 }]}
              accessibilityLabel="Следующий день"
            >
              <Ionicons name="chevron-forward" size={22} color={colors.text} />
            </Pressable>
          </View>

          {data?.prayer_cycle ? (
            <View style={styles.cycleBadge}>
              <Ionicons name="refresh-circle-outline" size={16} color={colors.primary} />
              <Text style={styles.cycleText}>
                Цикл {data.prayer_cycle.number} · день {data.prayer_cycle.day_index} из{' '}
                {data.prayer_cycle.member_count}
              </Text>
            </View>
          ) : null}
        </View>

        {prayerQuery.isPending ? <LoadingView label="Загрузка молитвенного плана…" /> : null}

        {prayerQuery.isError ? (
          <ErrorView
            message={
              prayerQuery.error instanceof Error ? prayerQuery.error.message : 'Ошибка'
            }
            hint={`API: ${resolveApiOrigin()}`}
            onRetry={() => void prayerQuery.refetch()}
          />
        ) : null}

        {data && !isPrayerEmpty(data) ? (
          <View style={styles.cards}>
            {data.members.length > 0 ? (
              <View style={styles.section}>
                <SectionTitle
                  icon="people-outline"
                  title="Сегодня молимся за члена церкви"
                  colors={colors}
                />
                {data.members.map((m) => (
                  <MemberPrayerCard key={m.id} member={m} dateKey={date} />
                ))}
              </View>
            ) : null}

            {data.global_themes.length > 0 || data.ministries.length > 0 ? (
              <View style={styles.section}>
                <SectionTitle icon="layers-outline" title="Темы и служения" colors={colors} />
                {data.global_themes.map((t) => (
                  <ThemePrayerCard key={`theme-${t.id}`} theme={t} />
                ))}
                {data.ministries.map((m) => (
                  <MinistryPrayerCard key={`ministry-${m.id}`} ministry={m} />
                ))}
              </View>
            ) : null}

            {data.backsliders.length > 0 ? (
              <View style={styles.section}>
                <SectionTitle icon="heart-dislike-outline" title="Отпавшие" colors={colors} />
                {data.backsliders.map((b) => (
                  <BacksliderPrayerCard key={b.id} backslider={b} />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {data && isPrayerEmpty(data) ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>На этот день план не заполнен</Text>
            <Text style={styles.emptyBody}>
              Выберите другую дату или обратитесь к координатору молитвы.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({
  icon,
  title,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  colors: ThemeColors;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: `${colors.primary}14`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: colors.text }}>{title}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 32,
    },
    cyclePlanBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
      padding: 14,
      borderRadius: colors.radius,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: `${colors.primary}40`,
      shadowColor: '#1c1917',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 2,
    },
    cyclePlanIcon: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cyclePlanMeta: { flex: 1, minWidth: 0 },
    cyclePlanTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
    cyclePlanSub: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
    dateCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      paddingHorizontal: 18,
      paddingVertical: 16,
      marginBottom: 20,
      shadowColor: '#1c1917',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.06,
      shadowRadius: 16,
      elevation: 3,
    },
    dateTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    dateLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
    },
    todayBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: `${colors.primary}12`,
    },
    todayBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
    dateControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    dateArrow: {
      width: 44,
      height: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'rgba(28, 25, 23, 0.1)',
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateCaptionWrap: {
      flex: 1,
    },
    dateCaption: {
      textAlign: 'center',
      fontWeight: '700',
      fontSize: 15,
      color: colors.text,
      lineHeight: 20,
      textTransform: 'capitalize',
    },
    cycleBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: 'rgba(28,25,23,0.06)',
    },
    cycleText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    cards: {
      gap: 8,
    },
    section: {
      marginBottom: 8,
    },
    empty: {
      alignItems: 'center',
      paddingVertical: 48,
      paddingHorizontal: 24,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    emptyBody: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
  });
}
