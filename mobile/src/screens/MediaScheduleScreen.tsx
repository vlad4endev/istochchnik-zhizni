import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addWeeks,
  endOfWeek,
  format,
  isBefore,
  parseISO,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  fetchMediaEvents,
  fetchMediaRoles,
  fetchMyMediaSchedule,
  updateMediaAssignmentStatus,
  type MediaAssignment,
  type MediaEvent,
} from '../api/mediaSchedule';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { ScreenHeader } from '../components/ScreenHeader';
import { useMediaScheduleAccess } from '../hooks/useMediaScheduleAccess';
import { assignmentStatusLabel } from '../lib/mediaAccess';
import { useTheme, type ThemeColors } from '../theme';

type TabKey = 'my' | 'team';

type MyRow = { event: MediaEvent; assignment: MediaAssignment };

function eventTitle(ev: MediaEvent): string {
  return (ev.template_name?.trim() || ev.title.trim() || 'Служение');
}

export function MediaScheduleScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { canView, isLoading: accessLoading } = useMediaScheduleAccess();
  const [tab, setTab] = useState<TabKey>('my');
  const [weekCursor, setWeekCursor] = useState(() => new Date());

  const myFrom = useMemo(() => new Date(), []);
  const myTo = useMemo(() => addWeeks(new Date(), 4), []);

  const weekStart = startOfWeek(weekCursor, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(weekCursor, { weekStartsOn: 1 });

  if (accessLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <ScreenHeader title="Расписание" subtitle="Медиа-служение" />
        <LoadingView />
      </SafeAreaView>
    );
  }

  if (!canView) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <ScreenHeader title="Расписание" subtitle="Медиа-служение" />
        <View style={styles.denied}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
          <Text style={styles.deniedTitle}>Нет доступа</Text>
          <Text style={styles.deniedBody}>
            Раздел доступен только служителям медиа-направления
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Расписание" subtitle="Медиа-служение" />

      <View style={styles.tabs}>
        <TabButton
          label="Моё"
          active={tab === 'my'}
          onPress={() => setTab('my')}
          colors={colors}
        />
        <TabButton
          label="Команда"
          active={tab === 'team'}
          onPress={() => setTab('team')}
          colors={colors}
        />
      </View>

      {tab === 'my' ? (
        <MyScheduleTab from={myFrom} to={myTo} colors={colors} />
      ) : (
        <TeamScheduleTab
          weekStart={weekStart}
          weekEnd={weekEnd}
          onPrevWeek={() => setWeekCursor((d) => addWeeks(d, -1))}
          onNextWeek={() => setWeekCursor((d) => addWeeks(d, 1))}
          onThisWeek={() => setWeekCursor(new Date())}
          colors={colors}
        />
      )}
    </SafeAreaView>
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
      style={({ pressed }) => [
        {
          flex: 1,
          paddingVertical: 10,
          borderRadius: 12,
          alignItems: 'center',
          backgroundColor: active ? colors.primary : colors.surfaceElevated,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <Text
        style={{
          fontSize: 14,
          fontWeight: '700',
          color: active ? colors.textOnPrimary : colors.textSecondary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function MyScheduleTab({
  from,
  to,
  colors,
}: {
  from: Date;
  to: Date;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const qc = useQueryClient();
  const today = startOfDay(new Date());

  const scheduleQ = useQuery({
    queryKey: ['media-schedule', 'my', from.toISOString(), to.toISOString()],
    queryFn: () => fetchMyMediaSchedule(from, to),
  });

  const statusMut = useMutation({
    mutationFn: ({
      assignmentId,
      status,
    }: {
      assignmentId: number;
      status: 'confirmed' | 'declined';
    }) => updateMediaAssignmentStatus(assignmentId, status),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['media-schedule'] });
    },
  });

  const rows = useMemo((): MyRow[] => {
    const out: MyRow[] = [];
    for (const event of scheduleQ.data ?? []) {
      for (const assignment of event.assignments) {
        out.push({ event, assignment });
      }
    }
    out.sort((a, b) => a.event.event_date.localeCompare(b.event.event_date));
    return out;
  }, [scheduleQ.data]);

  const pendingCount = rows.filter(
    ({ assignment, event }) =>
      !isBefore(parseISO(event.event_date), today) &&
      (assignment.status === 'assigned' || assignment.status === 'pending'),
  ).length;

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={scheduleQ.isRefetching}
          onRefresh={() => void scheduleQ.refetch()}
          tintColor={colors.primary}
        />
      }
    >
      <Text style={styles.rangeHint}>
        Ближайшие 4 недели
        {pendingCount > 0 ? ` · ${pendingCount} ждут ответа` : ''}
      </Text>

      {scheduleQ.isLoading ? <LoadingView /> : null}
      {scheduleQ.isError ? (
        <ErrorView
          message={scheduleQ.error instanceof Error ? scheduleQ.error.message : 'Ошибка'}
          onRetry={() => void scheduleQ.refetch()}
        />
      ) : null}

      {!scheduleQ.isLoading && !scheduleQ.isError && rows.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={44} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Нет назначений</Text>
          <Text style={styles.emptyBody}>На ближайшие 4 недели служений нет</Text>
        </View>
      ) : null}

      {rows.map(({ event, assignment }) => (
        <MyAssignmentCard
          key={assignment.id}
          event={event}
          assignment={assignment}
          today={today}
          colors={colors}
          busy={statusMut.isPending}
          onConfirm={() =>
            statusMut.mutate({ assignmentId: assignment.id, status: 'confirmed' })
          }
          onDecline={() =>
            statusMut.mutate({ assignmentId: assignment.id, status: 'declined' })
          }
        />
      ))}

      {statusMut.isError ? (
        <Text style={styles.mutError}>
          {statusMut.error instanceof Error ? statusMut.error.message : 'Ошибка'}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function MyAssignmentCard({
  event,
  assignment,
  today,
  colors,
  busy,
  onConfirm,
  onDecline,
}: {
  event: MediaEvent;
  assignment: MediaAssignment;
  today: Date;
  colors: ThemeColors;
  busy: boolean;
  onConfirm: () => void;
  onDecline: () => void;
}) {
  const past = isBefore(parseISO(event.event_date), today);
  const pending = assignment.status === 'assigned' || assignment.status === 'pending';

  return (
    <View style={[cardStyle(colors), past && { opacity: 0.55 }]}>
      <View style={[cardStripe, { backgroundColor: assignment.role.color }]} />
      <View style={cardBody}>
        <Text style={metaText(colors)}>
          {format(parseISO(event.event_date), 'd MMMM, EEEE', { locale: ru })}
          {event.start_time ? ` · ${event.start_time}` : ''}
        </Text>
        <Text style={titleText(colors)}>{eventTitle(event)}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <View style={[roleChip, { backgroundColor: assignment.role.color }]}>
            <Text style={roleChipText}>{assignment.role.name}</Text>
          </View>
          <StatusBadge status={assignment.status} colors={colors} />
        </View>
        {!past && pending ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <Pressable
              onPress={onConfirm}
              disabled={busy}
              style={({ pressed }) => [
                actionBtn,
                { backgroundColor: '#16a34a', opacity: busy || pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={actionBtnText}>Подтвердить</Text>
            </Pressable>
            <Pressable
              onPress={onDecline}
              disabled={busy}
              style={({ pressed }) => [
                actionBtn,
                {
                  backgroundColor: '#fff1f2',
                  borderWidth: 1,
                  borderColor: '#fecdd3',
                  opacity: busy || pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[actionBtnText, { color: '#be123c' }]}>Отказать</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function TeamScheduleTab({
  weekStart,
  weekEnd,
  onPrevWeek,
  onNextWeek,
  onThisWeek,
  colors,
}: {
  weekStart: Date;
  weekEnd: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onThisWeek: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  const eventsQ = useQuery({
    queryKey: ['media-schedule', 'events', weekStart.toISOString(), weekEnd.toISOString()],
    queryFn: () => fetchMediaEvents(weekStart, weekEnd),
  });

  const rolesQ = useQuery({
    queryKey: ['media-schedule', 'roles'],
    queryFn: fetchMediaRoles,
  });

  const events = useMemo(() => {
    return [...(eventsQ.data ?? [])].sort((a, b) =>
      a.event_date.localeCompare(b.event_date) || (a.start_time ?? '').localeCompare(b.start_time ?? ''),
    );
  }, [eventsQ.data]);

  const activeRoleCount = (rolesQ.data ?? []).filter((r) => r.is_active).length;
  const weekLabel = `${format(weekStart, 'd MMM', { locale: ru })} – ${format(weekEnd, 'd MMM yyyy', { locale: ru })}`;

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={eventsQ.isRefetching}
          onRefresh={() => void eventsQ.refetch()}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.weekNav}>
        <Pressable onPress={onPrevWeek} style={styles.weekBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Pressable onPress={onThisWeek} style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.weekLabel}>{weekLabel}</Text>
          <Text style={styles.weekSub}>Неделя команды</Text>
        </Pressable>
        <Pressable onPress={onNextWeek} style={styles.weekBtn}>
          <Ionicons name="chevron-forward" size={22} color={colors.text} />
        </Pressable>
      </View>

      {eventsQ.isLoading ? <LoadingView /> : null}
      {eventsQ.isError ? (
        <ErrorView
          message={eventsQ.error instanceof Error ? eventsQ.error.message : 'Ошибка'}
          onRetry={() => void eventsQ.refetch()}
        />
      ) : null}

      {!eventsQ.isLoading && !eventsQ.isError && events.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={44} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Нет служений</Text>
          <Text style={styles.emptyBody}>На эту неделю планов с медиа-командой нет</Text>
        </View>
      ) : null}

      {events.map((event) => (
        <TeamEventCard
          key={event.id}
          event={event}
          totalRoles={activeRoleCount}
          colors={colors}
        />
      ))}
    </ScrollView>
  );
}

function TeamEventCard({
  event,
  totalRoles,
  colors,
}: {
  event: MediaEvent;
  totalRoles: number;
  colors: ThemeColors;
}) {
  const filledRoles = new Set(event.assignments.map((a) => a.role_id)).size;
  const assignments = [...event.assignments].sort((a, b) =>
    a.role.sort_order - b.role.sort_order || a.role.name.localeCompare(b.role.name),
  );

  return (
    <View style={cardStyle(colors)}>
      <View style={[cardStripe, { backgroundColor: colors.primary }]} />
      <View style={cardBody}>
        <Text style={metaText(colors)}>
          {format(parseISO(event.event_date), 'd MMMM, EEEE', { locale: ru })}
          {event.start_time ? ` · ${event.start_time}` : ''}
        </Text>
        <Text style={titleText(colors)}>{eventTitle(event)}</Text>
        {totalRoles > 0 ? (
          <Text style={[metaText(colors), { marginTop: 4 }]}>
            Роли: {filledRoles}/{totalRoles}
          </Text>
        ) : null}
        <View style={{ marginTop: 10, gap: 8 }}>
          {assignments.length === 0 ? (
            <Text style={metaText(colors)}>Назначений пока нет</Text>
          ) : (
            assignments.map((a) => (
              <View key={a.id} style={teamRowStyle(colors)}>
                <View style={[roleChip, { backgroundColor: a.role.color }]}>
                  <Text style={roleChipText}>{a.role.name}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.text }} numberOfLines={1}>
                  {a.member.name}
                </Text>
                <StatusBadge status={a.status} colors={colors} compact />
              </View>
            ))
          )}
        </View>
      </View>
    </View>
  );
}

function StatusBadge({
  status,
  colors,
  compact = false,
}: {
  status: string;
  colors: ThemeColors;
  compact?: boolean;
}) {
  let bg = '#fffbeb';
  let fg = '#b45309';
  let icon: keyof typeof Ionicons.glyphMap = 'time-outline';

  if (status === 'confirmed') {
    bg = '#ecfdf5';
    fg = '#047857';
    icon = 'checkmark-circle';
  } else if (status === 'declined') {
    bg = '#fff1f2';
    fg = '#be123c';
    icon = 'close-circle';
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: compact ? 8 : 10,
        paddingVertical: compact ? 4 : 6,
        borderRadius: 999,
        backgroundColor: bg,
      }}
    >
      <Ionicons name={icon} size={compact ? 14 : 16} color={fg} />
      {!compact ? (
        <Text style={{ fontSize: 12, fontWeight: '700', color: fg }}>
          {assignmentStatusLabel(status)}
        </Text>
      ) : null}
    </View>
  );
}

const cardStripe = { height: 4, width: '100%' as const };
const cardBody = { padding: 16 };
const roleChip = { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 };
const roleChipText: TextStyle = { color: '#fff', fontSize: 12, fontWeight: '800' };
const actionBtn = {
  flex: 1,
  minHeight: 44,
  borderRadius: 12,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  paddingHorizontal: 12,
};
const actionBtnText: TextStyle = { color: '#fff', fontSize: 14, fontWeight: '800' };

function cardStyle(colors: ThemeColors) {
  return {
    borderRadius: colors.radius,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden' as const,
    marginBottom: 12,
    shadowColor: '#1c1917',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  };
}

function metaText(colors: ThemeColors): TextStyle {
  return {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  };
}

function titleText(colors: ThemeColors): TextStyle {
  return {
    marginTop: 6,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  };
}

function teamRowStyle(colors: ThemeColors) {
  return {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(28,25,23,0.08)',
  };
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    tabs: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    scroll: {
      padding: 16,
      paddingBottom: 32,
    },
    rangeHint: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
      marginBottom: 12,
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
    weekNav: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
      gap: 8,
    },
    weekBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceElevated,
    },
    weekLabel: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text,
    },
    weekSub: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      marginTop: 2,
    },
    mutError: {
      marginTop: 8,
      textAlign: 'center',
      color: '#be123c',
      fontWeight: '600',
    },
  });
}
