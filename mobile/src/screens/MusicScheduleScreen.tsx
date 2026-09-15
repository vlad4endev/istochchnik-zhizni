import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  fetchMusicEvents,
  fetchMyMusicSchedule,
  updateMusicAssignmentStatus,
  type MusicAssignment,
  type MusicEvent,
} from '../api/musicSchedule';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { ScreenHeader } from '../components/ScreenHeader';
import { useMusicScheduleAccess } from '../hooks/useMusicScheduleAccess';
import { assignmentStatusLabel } from '../lib/mediaAccess';
import { useTheme, type ThemeColors } from '../theme';

type TabKey = 'my' | 'team';
type MyRow = { event: MusicEvent; assignment: MusicAssignment };

function eventTitle(ev: MusicEvent): string {
  return ev.template_name?.trim() || ev.title.trim() || 'Служение';
}

export function MusicScheduleScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { canView, isLoading: accessLoading } = useMusicScheduleAccess();
  const [tab, setTab] = useState<TabKey>('my');
  const qc = useQueryClient();

  const myFrom = useMemo(() => new Date(), []);
  const myTo = useMemo(() => addWeeks(new Date(), 4), []);

  const myQuery = useQuery({
    queryKey: ['music-schedule', 'my'],
    queryFn: () => fetchMyMusicSchedule(myFrom, myTo),
    enabled: canView && tab === 'my',
  });

  const teamQuery = useQuery({
    queryKey: ['music-schedule', 'team'],
    queryFn: () => fetchMusicEvents(myFrom, myTo),
    enabled: canView && tab === 'team',
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'confirmed' | 'declined' }) =>
      updateMusicAssignmentStatus(id, status),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['music-schedule'] });
    },
  });

  if (accessLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <ScreenHeader title="Расписание" subtitle="Музыкальное служение" />
        <LoadingView />
      </SafeAreaView>
    );
  }

  if (!canView) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <ScreenHeader title="Расписание" subtitle="Музыкальное служение" />
        <View style={styles.denied}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
          <Text style={styles.deniedTitle}>Нет доступа</Text>
          <Text style={styles.deniedBody}>
            Раздел доступен служителям музыкального направления
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const myRows: MyRow[] = (myQuery.data ?? []).flatMap((event) =>
    (event.assignments ?? []).map((assignment) => ({ event, assignment })),
  );

  const activeQuery = tab === 'my' ? myQuery : teamQuery;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Расписание" subtitle="Музыкальное служение" />
      <View style={styles.tabs}>
        <TabButton label="Моё" active={tab === 'my'} onPress={() => setTab('my')} colors={colors} />
        <TabButton
          label="Команда"
          active={tab === 'team'}
          onPress={() => setTab('team')}
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
          {tab === 'my' ? (
            myRows.length === 0 ? (
              <EmptyState colors={colors} text="Нет назначений на ближайшие недели" />
            ) : (
              myRows.map(({ event, assignment }) => (
                <View key={`${event.id}-${assignment.id}`} style={styles.card}>
                  <Text style={styles.cardTitle}>{eventTitle(event)}</Text>
                  <Text style={styles.cardMeta}>
                    {format(parseISO(event.event_date), 'EEEE, d MMMM', { locale: ru })}
                    {event.start_time ? ` · ${event.start_time}` : ''}
                  </Text>
                  <Text style={styles.role}>
                    {assignment.role.name} · {assignmentStatusLabel(assignment.status)}
                  </Text>
                  {assignment.status === 'assigned' || assignment.status === 'pending' ? (
                    <View style={styles.rowActions}>
                      <Pressable
                        onPress={() =>
                          statusMutation.mutate({ id: assignment.id, status: 'confirmed' })
                        }
                        style={[styles.smallBtn, { backgroundColor: '#16a34a' }]}
                      >
                        <Text style={styles.smallBtnText}>Подтвердить</Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          statusMutation.mutate({ id: assignment.id, status: 'declined' })
                        }
                        style={[styles.smallBtn, { backgroundColor: '#dc2626' }]}
                      >
                        <Text style={styles.smallBtnText}>Отказаться</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ))
            )
          ) : (teamQuery.data ?? []).length === 0 ? (
            <EmptyState colors={colors} text="Нет событий команды" />
          ) : (
            (teamQuery.data ?? []).map((event) => (
              <View key={event.id} style={styles.card}>
                <Text style={styles.cardTitle}>{eventTitle(event)}</Text>
                <Text style={styles.cardMeta}>
                  {format(parseISO(event.event_date), 'EEEE, d MMMM', { locale: ru })}
                  {event.start_time ? ` · ${event.start_time}` : ''}
                </Text>
                {(event.assignments ?? []).map((a) => (
                  <Text key={a.id} style={styles.role}>
                    {a.role.name}: {a.member.name} ({assignmentStatusLabel(a.status)})
                  </Text>
                ))}
              </View>
            ))
          )}
        </ScrollView>
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

function EmptyState({ colors, text }: { colors: ThemeColors; text: string }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 48, gap: 8 }}>
      <Ionicons name="musical-notes-outline" size={36} color={colors.textMuted} />
      <Text style={{ color: colors.textMuted, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
    content: { padding: 16, paddingBottom: 40 },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.06)',
    },
    cardTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
    cardMeta: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
    role: { fontSize: 13, color: colors.textSecondary, marginTop: 8 },
    rowActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
    smallBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
    smallBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
    deniedTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
    deniedBody: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  });
}
