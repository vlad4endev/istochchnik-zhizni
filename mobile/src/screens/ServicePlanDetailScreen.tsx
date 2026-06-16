import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { addMinutes, format, parse, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchPublicServicePlan } from '../api/servicePlanner';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import {
  deriveBlockDisplay,
  planDisplayTitle,
  statusLabel,
  visiblePlanBlocks,
  type BlockDisplay,
} from '../lib/servicePlanDisplay';
import type { RootStackParamList } from '../navigation/types';
import { useTheme, type ThemeColors } from '../theme';

type DetailRoute = RouteProp<RootStackParamList, 'ServicePlanDetail'>;

function parsePlanStart(dateIso: string, time: string): Date {
  const hm = (time || '10:00').slice(0, 5);
  return parse(`${dateIso} ${hm}`, 'yyyy-MM-dd HH:mm', new Date());
}

export function ServicePlanDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<DetailRoute>();
  const { shareToken, title } = route.params;

  const planQuery = useQuery({
    queryKey: ['service-planner', 'public', shareToken],
    queryFn: () => fetchPublicServicePlan(shareToken),
  });

  useEffect(() => {
    const planTitle = planQuery.data
      ? planDisplayTitle(planQuery.data.plan.template_name, title)
      : title;
    navigation.setOptions({ title: planTitle || 'План служения' });
  }, [navigation, planQuery.data, title]);

  const timeline = useMemo(() => {
    if (!planQuery.data) return [];
    const { plan, blocks } = planQuery.data;
    let cursor = parsePlanStart(plan.service_date, plan.start_time);
    const visible = visiblePlanBlocks(blocks);

    return visible.map((block) => {
      const display = deriveBlockDisplay(block);
      const separator = display.isSeparator;
      const startsAt = format(cursor, 'HH:mm');
      const duration = separator ? 0 : display.durationMinutes;
      cursor = addMinutes(cursor, duration);
      return { ...display, startsAt };
    });
  }, [planQuery.data]);

  if (planQuery.isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <LoadingView />
      </SafeAreaView>
    );
  }

  if (planQuery.isError || !planQuery.data) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ErrorView
          message={planQuery.error instanceof Error ? planQuery.error.message : 'План не найден'}
          onRetry={() => void planQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  const { plan, broadcast_assignments: broadcastAssignments } = planQuery.data;
  const headerTitle = planDisplayTitle(plan.template_name, title);
  const dateLabel = format(parseISO(plan.service_date), 'd MMMM yyyy, EEEE', {
    locale: ru,
  });

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroDate}>{dateLabel}</Text>
          <Text style={styles.heroTitle}>{headerTitle}</Text>
          <View style={styles.heroMeta}>
            <Text style={styles.heroMetaText}>Начало {plan.start_time?.slice(0, 5) || '—'}</Text>
            <Text style={styles.heroMetaText}>·</Text>
            <Text style={styles.heroMetaText}>{plan.total_duration_minutes} мин</Text>
            <Text style={styles.heroMetaText}>·</Text>
            <Text style={styles.heroMetaText}>{statusLabel(plan.status)}</Text>
          </View>
          {plan.leader_name ? (
            <Text style={styles.heroPerson}>Ведущий: {plan.leader_name}</Text>
          ) : null}
          {plan.preacher_name ? (
            <Text style={styles.heroPerson}>Проповедник: {plan.preacher_name}</Text>
          ) : null}
          {plan.notes?.trim() ? (
            <Text style={styles.heroNotes}>{plan.notes.trim()}</Text>
          ) : null}
        </View>

        {broadcastAssignments.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Медиа-команда</Text>
            {broadcastAssignments.map((a, idx) => (
              <View key={`${a.role_name}-${idx}`} style={styles.mediaRow}>
                <View style={[styles.mediaDot, { backgroundColor: a.role_color || colors.primary }]} />
                <Text style={styles.mediaRole}>{a.role_name}</Text>
                <Text style={styles.mediaName}>{a.member_name}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Программа</Text>
        {timeline.map((block) => (
          <BlockCard key={block.id} block={block} colors={colors} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function BlockCard({ block, colors }: { block: BlockDisplay; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (block.isSeparator) {
    return (
      <View style={styles.separator}>
        <View style={styles.separatorLine} />
        {block.heading ? <Text style={styles.separatorText}>{block.heading}</Text> : null}
        <View style={styles.separatorLine} />
      </View>
    );
  }

  return (
    <View style={styles.blockCard}>
      <View style={styles.blockTimeCol}>
        <Text style={styles.blockTime}>{block.startsAt}</Text>
        {block.durationMinutes > 0 ? (
          <Text style={styles.blockDuration}>{block.durationMinutes}′</Text>
        ) : null}
      </View>
      <View style={[styles.blockIcon, { backgroundColor: block.iconBg }]}>
        <Ionicons name={block.icon} size={18} color={block.iconColor} />
      </View>
      <View style={styles.blockBody}>
        <Text style={styles.blockHeading}>{block.heading}</Text>
        <Text style={styles.blockSubtitle}>{block.subtitle}</Text>
        {block.poemSubline ? <Text style={styles.blockExtra}>{block.poemSubline}</Text> : null}
        {block.sermonScripture ? (
          <Text style={styles.blockExtra}>Писание: {block.sermonScripture}</Text>
        ) : null}
        {block.songLine ? <Text style={styles.blockSong}>{block.songLine}</Text> : null}
        {block.birthdaysList.length > 0 ? (
          <Text style={styles.blockExtra}>Именинники: {block.birthdaysList.join(' • ')}</Text>
        ) : null}
        {block.scheduleList.length > 0 ? (
          <View style={{ marginTop: 4, gap: 2 }}>
            <Text style={[styles.blockExtra, { fontWeight: '700' }]}>Расписание:</Text>
            {block.scheduleList.map((line) => (
              <Text key={line} style={styles.blockExtra}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}
        {block.note ? <Text style={styles.blockNote}>{block.note}</Text> : null}
      </View>
    </View>
  );
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
      gap: 12,
    },
    hero: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      padding: 18,
      gap: 6,
    },
    heroDate: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    heroTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
    },
    heroMeta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 4,
    },
    heroMetaText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    heroPerson: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginTop: 2,
    },
    heroNotes: {
      marginTop: 8,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
    },
    section: {
      gap: 8,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: 4,
    },
    mediaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    mediaDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    mediaRole: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
      minWidth: 72,
    },
    mediaName: {
      flex: 1,
      fontSize: 14,
      color: colors.textSecondary,
    },
    blockCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 14,
      padding: 12,
    },
    blockTimeCol: {
      width: 44,
      alignItems: 'flex-end',
      paddingTop: 2,
    },
    blockTime: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.primary,
    },
    blockDuration: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
    },
    blockIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    blockBody: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    blockHeading: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text,
      lineHeight: 21,
    },
    blockSubtitle: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '600',
    },
    blockExtra: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    blockSong: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
      marginTop: 2,
    },
    blockNote: {
      marginTop: 4,
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
    },
    separator: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
    },
    separatorLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: 'rgba(28,25,23,0.15)',
    },
    separatorText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
    },
  });
}
