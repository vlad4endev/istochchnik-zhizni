import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { addWeeks, format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
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

import {
  fetchMySundaySchedule,
  fetchSundaySchedulePlans,
  type SundaySchedulePlan,
} from '../api/sundaySchedule';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { ScreenHeader } from '../components/ScreenHeader';
import { useSundayScheduleAccess } from '../hooks/useSundayScheduleAccess';
import { useTheme, type ThemeColors } from '../theme';

type TabKey = 'my' | 'all';

function formatYmd(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function SundayScheduleScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { canView, isLoading: accessLoading } = useSundayScheduleAccess();
  const [tab, setTab] = useState<TabKey>('my');

  const range = useMemo(() => {
    const from = new Date();
    const to = addWeeks(from, 6);
    return { from: formatYmd(from), to: formatYmd(to) };
  }, []);

  const myQuery = useQuery({
    queryKey: ['sunday-schedule', 'my', range],
    queryFn: () => fetchMySundaySchedule(range),
    enabled: canView && tab === 'my',
  });

  const allQuery = useQuery({
    queryKey: ['sunday-schedule', 'all', range],
    queryFn: () => fetchSundaySchedulePlans(range),
    enabled: canView && tab === 'all',
  });

  if (accessLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <ScreenHeader title="Расписание" subtitle="Воскресное служение" />
        <LoadingView />
      </SafeAreaView>
    );
  }

  if (!canView) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <ScreenHeader title="Расписание" subtitle="Воскресное служение" />
        <View style={styles.denied}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
          <Text style={styles.deniedTitle}>Нет доступа</Text>
          <Text style={styles.deniedBody}>
            Раздел доступен пасторам и служителям воскресного направления
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const activeQuery = tab === 'my' ? myQuery : allQuery;
  const plans = activeQuery.data ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Расписание" subtitle="Воскресное служение" />
      <View style={styles.tabs}>
        <TabButton label="Моё" active={tab === 'my'} onPress={() => setTab('my')} colors={colors} />
        <TabButton
          label="Все"
          active={tab === 'all'}
          onPress={() => setTab('all')}
          colors={colors}
        />
      </View>

      {activeQuery.isLoading ? (
        <LoadingView />
      ) : activeQuery.isError ? (
        <ErrorView
          message={String(activeQuery.error)}
          onRetry={() => void activeQuery.refetch()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={activeQuery.isFetching}
              onRefresh={() => void activeQuery.refetch()}
            />
          }
        >
          {plans.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={36} color={colors.textMuted} />
              <Text style={styles.emptyText}>Нет планов на ближайшие недели</Text>
            </View>
          ) : (
            plans.map((plan) => <PlanCard key={`${plan.id}-${plan.service_date}`} plan={plan} colors={colors} />)
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function PlanCard({ plan, colors }: { plan: SundaySchedulePlan; colors: ThemeColors }) {
  return (
    <View
      style={{
        backgroundColor: colors.surfaceElevated,
        borderRadius: colors.radius,
        padding: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(28,25,23,0.06)',
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>
        {plan.template_name?.trim() || 'Воскресное служение'}
      </Text>
      <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>
        {format(parseISO(plan.service_date), 'EEEE, d MMMM', { locale: ru })}
        {plan.start_time ? ` · ${plan.start_time}` : ''}
      </Text>
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary, marginTop: 8 }}>
        {plan.status === 'published' ? 'Опубликовано' : 'Черновик'}
      </Text>
      {plan.leader ? (
        <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 6 }}>
          Ведущий: {plan.leader.name}
        </Text>
      ) : null}
      {plan.preacher ? (
        <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>
          Проповедник: {plan.preacher.name}
        </Text>
      ) : null}
      <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 8 }}>
        Блоков: {plan.blocks_count}
        {plan.has_program ? ' · есть программа' : ''}
      </Text>
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ThemeColors;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
        backgroundColor: active ? colors.primary : colors.surfaceElevated,
      }}
    >
      <Text
        style={{
          fontWeight: '700',
          color: active ? colors.textOnPrimary : colors.textMuted,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
    content: { padding: 16, paddingBottom: 40 },
    empty: { alignItems: 'center', paddingTop: 48, gap: 8 },
    emptyText: { color: colors.textMuted, fontWeight: '600' },
    denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
    deniedTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
    deniedBody: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  });
}
