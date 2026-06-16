import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { addWeeks, format, isBefore, parseISO, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useMemo } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchServicePlansRange, type ServicePlanListItem } from '../api/servicePlanner';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { ScreenHeader } from '../components/ScreenHeader';
import { useServicePlannerAccess } from '../hooks/useServicePlannerAccess';
import { planDisplayTitle, statusLabel } from '../lib/servicePlanDisplay';
import type { RootStackParamList } from '../navigation/types';
import { useTheme, type ThemeColors } from '../theme';

export function ServicePlannerScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { canView, isLoading: accessLoading } = useServicePlannerAccess();

  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  }, []);
  const to = useMemo(() => addWeeks(new Date(), 8), []);

  const plansQuery = useQuery({
    queryKey: ['service-planner', 'plans', from.toISOString(), to.toISOString()],
    queryFn: () => fetchServicePlansRange(from, to),
    enabled: canView,
  });

  const plans = useMemo(() => {
    const items = (plansQuery.data ?? []).filter((p) => !p.is_archived);
    return [...items].sort((a, b) => {
      const byDate = a.service_date.localeCompare(b.service_date);
      if (byDate !== 0) return byDate;
      return (a.start_time ?? '').localeCompare(b.start_time ?? '');
    });
  }, [plansQuery.data]);

  const today = startOfDay(new Date());

  if (accessLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <ScreenHeader title="Служение" subtitle="Планировщик собраний" />
        <LoadingView />
      </SafeAreaView>
    );
  }

  if (!canView) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <ScreenHeader title="Служение" subtitle="Планировщик собраний" />
        <View style={styles.denied}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
          <Text style={styles.deniedTitle}>Нет доступа</Text>
          <Text style={styles.deniedBody}>
            Раздел «Служение» недоступен для вашей роли. Обратитесь к администратору.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const openPlan = (plan: ServicePlanListItem) => {
    navigation.navigate('ServicePlanDetail', {
      planId: plan.id,
      shareToken: plan.share_token,
      title: planDisplayTitle(plan.template_name),
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Служение" subtitle="Планировщик собраний" />

      {plansQuery.isLoading ? <LoadingView /> : null}
      {plansQuery.isError ? (
        <ErrorView
          message={plansQuery.error instanceof Error ? plansQuery.error.message : 'Ошибка'}
          onRetry={() => void plansQuery.refetch()}
        />
      ) : null}

      {!plansQuery.isLoading && !plansQuery.isError ? (
        <FlatList
          data={plans}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={plans.length === 0 ? styles.emptyList : styles.list}
          refreshControl={
            <RefreshControl
              refreshing={plansQuery.isRefetching}
              onRefresh={() => void plansQuery.refetch()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={44} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>Нет планов служений</Text>
              <Text style={styles.emptyBody}>На ближайшие недели планы ещё не созданы</Text>
            </View>
          }
          renderItem={({ item }) => (
            <PlanRow plan={item} today={today} colors={colors} onPress={() => openPlan(item)} />
          )}
        />
      ) : null}
    </SafeAreaView>
  );
}

function PlanRow({
  plan,
  today,
  colors,
  onPress,
}: {
  plan: ServicePlanListItem;
  today: Date;
  colors: ThemeColors;
  onPress: () => void;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const past = isBefore(parseISO(plan.service_date), today);
  const title = planDisplayTitle(plan.template_name);
  const dateLabel = format(parseISO(plan.service_date), 'd MMMM, EEEE', { locale: ru });

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.planCard,
        past && { opacity: 0.65 },
        pressed && { opacity: 0.9 },
      ]}
    >
      <View style={cardTopStyle}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.dateText}>{dateLabel}</Text>
          <Text style={styles.titleText} numberOfLines={2}>
            {title}
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                plan.status === 'published' ? 'rgba(22,163,74,0.12)' : 'rgba(217,119,6,0.12)',
            },
          ]}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: plan.status === 'published' ? '#15803d' : '#b45309',
            }}
          >
            {statusLabel(plan.status)}
          </Text>
        </View>
      </View>

      <View style={metaRowStyle}>
        <MetaChip icon="time-outline" label={plan.start_time?.slice(0, 5) || '—'} colors={colors} />
        <MetaChip
          icon="list-outline"
          label={`${plan.blocks_count} блоков`}
          colors={colors}
        />
        <MetaChip
          icon="hourglass-outline"
          label={`${plan.total_duration_minutes} мин`}
          colors={colors}
        />
      </View>
    </Pressable>
  );
}

function MetaChip({
  icon,
  label,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  colors: ThemeColors;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ionicons name={icon} size={14} color={colors.textMuted} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>{label}</Text>
    </View>
  );
}

const cardTopStyle = {
  flexDirection: 'row' as const,
  alignItems: 'flex-start' as const,
  gap: 12,
};

const metaRowStyle = {
  flexDirection: 'row' as const,
  flexWrap: 'wrap' as const,
  gap: 12,
  marginTop: 12,
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    list: {
      padding: 16,
      paddingBottom: 32,
    },
    emptyList: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: 16,
    },
    empty: {
      alignItems: 'center',
      paddingVertical: 40,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.text,
      marginTop: 8,
    },
    emptyBody: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
    },
    denied: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 8,
    },
    deniedTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
      marginTop: 8,
    },
    deniedBody: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
    planCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 12,
      shadowColor: '#1c1917',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 2,
    },
    statusBadge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    dateText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    titleText: {
      marginTop: 4,
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
    },
  });
}
