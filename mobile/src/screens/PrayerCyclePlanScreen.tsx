import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parse } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  fetchCycleCollectionClaims,
  fetchWeekPlanMembers,
  patchCycleCollectionClaim,
  patchMemberCyclePrayer,
  runCuratorAutoDistribution,
} from '../api/prayer';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { ScreenHeader } from '../components/ScreenHeader';
import { usePrayerPlanAccess } from '../hooks/usePrayerPlanAccess';
import { memberRosterName } from '../lib/memberRosterName';
import type { NextWeekMemberDay } from '../types';
import type {
  CycleCollectionClaimsSnapshot,
  CycleCollectionCoordinatorRow,
  WeekPlanKind,
} from '../types/prayerCycle';
import { useTheme, type ThemeColors } from '../theme';

type QuickFilter =
  | 'all'
  | 'need_empty'
  | 'need_filled'
  | 'curator_free'
  | 'curator_mine'
  | 'curator_busy';

const FILTER_LABELS: Record<QuickFilter, string> = {
  all: 'Все',
  need_empty: 'Без нужды',
  need_filled: 'С нуждой',
  curator_free: 'Без куратора',
  curator_mine: 'Мои',
  curator_busy: 'Заняты',
};

function needText(member: NextWeekMemberDay['member']): string {
  return (member?.prayer_request ?? '').trim();
}

function dayLabel(dateKey: string): string {
  const d = parse(dateKey, 'yyyy-MM-dd', new Date());
  return format(d, 'EEE d.MM', { locale: ru });
}

export function PrayerCyclePlanScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const qc = useQueryClient();
  const { canManage, memberId, isLoading: accessLoading } = usePrayerPlanAccess();

  const [weekKind, setWeekKind] = useState<WeekPlanKind>('current');
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [distributionInfo, setDistributionInfo] = useState<string | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [prayerDraft, setPrayerDraft] = useState('');
  const [pickerMemberId, setPickerMemberId] = useState<number | null>(null);

  const weekQuery = useQuery({
    queryKey: ['calendar', 'week-members', weekKind],
    queryFn: () => fetchWeekPlanMembers(weekKind),
    enabled: canManage,
  });

  const claimsQuery = useQuery({
    queryKey: ['calendar', 'cycle', 'collection-claims', weekKind],
    queryFn: () => fetchCycleCollectionClaims(weekKind),
    enabled: canManage,
  });

  const claimByMemberId = useMemo(() => {
    const m = new Map<number, CycleCollectionClaimsSnapshot['members'][0]>();
    for (const row of claimsQuery.data?.members ?? []) {
      m.set(row.id, row);
    }
    return m;
  }, [claimsQuery.data?.members]);

  const assignMut = useMutation({
    mutationFn: ({
      memberId: mid,
      coordinatorId,
    }: {
      memberId: number;
      coordinatorId: number | null;
    }) =>
      patchCycleCollectionClaim(mid, coordinatorId != null, weekKind, coordinatorId ?? undefined),
    onSuccess: (data) => {
      qc.setQueryData(['calendar', 'cycle', 'collection-claims', weekKind], data);
      void qc.invalidateQueries({ queryKey: ['calendar', 'week-members'] });
      setPickerMemberId(null);
    },
    onError: (err: unknown) => {
      Alert.alert('Ошибка', err instanceof Error ? err.message : 'Не удалось сохранить');
    },
  });

  const savePrayerMut = useMutation({
    mutationFn: (input: { memberId: number; date: string; text: string }) =>
      patchMemberCyclePrayer(input.memberId, input.date, input.text),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['calendar', 'week-members'] });
      void qc.invalidateQueries({ queryKey: ['prayer'] });
      setExpandedDate(null);
    },
    onError: (err: unknown) => {
      Alert.alert('Ошибка', err instanceof Error ? err.message : 'Не удалось сохранить нужду');
    },
  });

  const autoDistMut = useMutation({
    mutationFn: () => runCuratorAutoDistribution(weekKind),
    onSuccess: (data) => {
      const label = data.week_kind === 'current' ? 'текущую' : 'следующую';
      setDistributionInfo(
        `Готово: ${data.total} назначений, уведомлено кураторов: ${data.pushed_coordinators}`,
      );
      void qc.invalidateQueries({ queryKey: ['calendar', 'cycle', 'collection-claims'] });
      void qc.invalidateQueries({ queryKey: ['calendar', 'week-members'] });
    },
    onError: (err: unknown) => {
      setDistributionInfo(null);
      Alert.alert(
        'Ошибка',
        err instanceof Error ? err.message : 'Не удалось выполнить автораспределение',
      );
    },
  });

  const days = weekQuery.data ?? [];
  const normalizedSearch = search.trim().toLowerCase();

  const filteredDays = useMemo(() => {
    return days.filter((row) => {
      const m = row.member;
      const blob = m
        ? `${memberRosterName(m)} ${m.name} ${m.first_name ?? ''} ${m.last_name ?? ''}`.toLowerCase()
        : '';
      if (normalizedSearch && !blob.includes(normalizedSearch)) return false;

      if (quickFilter === 'need_empty') return m && needText(m).length === 0;
      if (quickFilter === 'need_filled') return m && needText(m).length > 0;

      if (claimsQuery.isError) {
        return quickFilter === 'all' || quickFilter.startsWith('need_');
      }

      const mid = m?.id;
      const claim = mid != null ? claimByMemberId.get(mid) : undefined;
      const mine = memberId != null && claim?.claimed_by?.id === memberId;

      if (quickFilter === 'curator_mine') return mine;
      if (quickFilter === 'curator_free') return Boolean(claim && !claim.claimed_by);
      if (quickFilter === 'curator_busy') return Boolean(claim?.claimed_by && !mine);
      return true;
    });
  }, [
    days,
    normalizedSearch,
    quickFilter,
    claimByMemberId,
    memberId,
    claimsQuery.isError,
  ]);

  const stats = useMemo(() => {
    const filled = days.filter((r) => r.member && needText(r.member).length > 0).length;
    const empty = days.filter((r) => r.member && needText(r.member).length === 0).length;
    const free = days.filter((r) => {
      const mid = r.member?.id;
      const c = mid != null ? claimByMemberId.get(mid) : undefined;
      return Boolean(c && !c.claimed_by);
    }).length;
    return { filled, empty, free, total: days.length };
  }, [days, claimByMemberId]);

  const refreshing =
    (weekQuery.isFetching && !weekQuery.isLoading) ||
    (claimsQuery.isFetching && !claimsQuery.isLoading);

  const onRefresh = () => {
    void weekQuery.refetch();
    void claimsQuery.refetch();
  };

  if (accessLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <ScreenHeader title="Сбор нужд" subtitle="Очередь цикла" />
        <LoadingView />
      </SafeAreaView>
    );
  }

  if (!canManage) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <ScreenHeader title="Сбор нужд" subtitle="Очередь цикла" />
        <View style={styles.denied}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
          <Text style={styles.deniedTitle}>Нет доступа</Text>
          <Text style={styles.deniedBody}>
            Раздел доступен пастору, администратору и координаторам сбора нужд.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const coordinators = claimsQuery.data?.coordinators ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader
        title="Сбор нужд"
        subtitle={`Цикл ${claimsQuery.data?.cycle_number ?? '…'} · распределение участников`}
      />

      <View style={styles.tabs}>
        {(['current', 'next'] as const).map((k) => (
          <Pressable
            key={k}
            onPress={() => {
              setWeekKind(k);
              setDistributionInfo(null);
            }}
            style={[styles.tab, weekKind === k && styles.tabActive]}
          >
            <Text style={[styles.tabText, weekKind === k && styles.tabTextActive]}>
              {k === 'current' ? 'Эта неделя' : 'Следующая'}
            </Text>
          </Pressable>
        ))}
      </View>

      {weekQuery.isLoading || claimsQuery.isLoading ? <LoadingView /> : null}

      {weekQuery.isError ? (
        <ErrorView
          message={weekQuery.error instanceof Error ? weekQuery.error.message : 'Ошибка'}
          onRetry={() => void weekQuery.refetch()}
        />
      ) : null}

      {!weekQuery.isLoading ? (
        <FlatList
          data={filteredDays}
          keyExtractor={(item) => item.date}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <View style={styles.distCard}>
                <Text style={styles.distHint}>
                  Автоматически назначить кураторов по нагрузке и отправить уведомления.
                </Text>
                <Pressable
                  onPress={() => autoDistMut.mutate()}
                  disabled={autoDistMut.isPending}
                  style={({ pressed }) => [
                    styles.distBtn,
                    pressed && { opacity: 0.9 },
                    autoDistMut.isPending && { opacity: 0.6 },
                  ]}
                >
                  {autoDistMut.isPending ? (
                    <ActivityIndicator color={colors.textOnPrimary} />
                  ) : (
                    <Text style={styles.distBtnText}>
                      Автораспределить ({weekKind === 'current' ? 'эта' : 'следующая'} неделя)
                    </Text>
                  )}
                </Pressable>
                {distributionInfo ? (
                  <Text style={styles.distOk}>{distributionInfo}</Text>
                ) : null}
              </View>

              <Text style={styles.stats}>
                {stats.total} дн. · с нуждой {stats.filled} · пусто {stats.empty}
                {!claimsQuery.isError ? ` · без куратора ${stats.free}` : ''}
              </Text>

              <View style={styles.searchWrap}>
                <Ionicons name="search-outline" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Поиск по имени…"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <View style={styles.filterRow}>
                {(Object.keys(FILTER_LABELS) as QuickFilter[]).map((f) => {
                  if (
                    claimsQuery.isError &&
                    (f === 'curator_free' || f === 'curator_mine' || f === 'curator_busy')
                  ) {
                    return null;
                  }
                  return (
                    <Pressable
                      key={f}
                      onPress={() => setQuickFilter(f)}
                      style={[styles.filterChip, quickFilter === f && styles.filterChipActive]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          quickFilter === f && styles.filterChipTextActive,
                        ]}
                      >
                        {FILTER_LABELS[f]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {claimsQuery.isError ? (
                <Text style={styles.warn}>Отметки кураторов недоступны</Text>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <DayRow
              row={item}
              claim={item.member?.id != null ? claimByMemberId.get(item.member.id) : undefined}
              claimsError={claimsQuery.isError}
              currentUserId={memberId}
              coordinators={coordinators}
              expanded={expandedDate === item.date}
              prayerDraft={prayerDraft}
              onToggleExpand={() => {
                const m = item.member;
                if (!m) return;
                if (expandedDate === item.date) {
                  setExpandedDate(null);
                } else {
                  setExpandedDate(item.date);
                  setPrayerDraft(needText(m));
                }
              }}
              onDraftChange={setPrayerDraft}
              onSavePrayer={() => {
                const m = item.member;
                if (!m) return;
                savePrayerMut.mutate({
                  memberId: m.id,
                  date: item.date,
                  text: prayerDraft,
                });
              }}
              savePending={savePrayerMut.isPending}
              onPickCurator={() => {
                if (item.member?.id != null) setPickerMemberId(item.member.id);
              }}
              assignPending={assignMut.isPending}
              colors={colors}
            />
          )}
          ListEmptyComponent={
            !weekQuery.isLoading ? (
              <Text style={styles.empty}>Ничего не найдено</Text>
            ) : null
          }
        />
      ) : null}

      <CoordinatorPickerModal
        visible={pickerMemberId != null}
        coordinators={coordinators}
        currentId={
          pickerMemberId != null ? claimByMemberId.get(pickerMemberId)?.claimed_by?.id ?? null : null
        }
        onClose={() => setPickerMemberId(null)}
        onSelect={(coordinatorId) => {
          if (pickerMemberId == null) return;
          assignMut.mutate({ memberId: pickerMemberId, coordinatorId });
        }}
        colors={colors}
      />
    </SafeAreaView>
  );
}

function DayRow({
  row,
  claim,
  claimsError,
  currentUserId,
  coordinators,
  expanded,
  prayerDraft,
  onToggleExpand,
  onDraftChange,
  onSavePrayer,
  savePending,
  onPickCurator,
  assignPending,
  colors,
}: {
  row: NextWeekMemberDay;
  claim?: CycleCollectionClaimsSnapshot['members'][0];
  claimsError: boolean;
  currentUserId: number | null;
  coordinators: CycleCollectionCoordinatorRow[];
  expanded: boolean;
  prayerDraft: string;
  onToggleExpand: () => void;
  onDraftChange: (t: string) => void;
  onSavePrayer: () => void;
  savePending: boolean;
  onPickCurator: () => void;
  assignPending: boolean;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createRowStyles(colors), [colors]);
  const mem = row.member;
  const name = mem ? memberRosterName(mem) : '—';
  const hasNeed = Boolean(mem && needText(mem).length > 0);
  const mine = currentUserId != null && claim?.claimed_by?.id === currentUserId;
  const curatorLabel = claim?.claimed_by
    ? mine
      ? 'Вы'
      : memberRosterName({
          id: claim.claimed_by.id,
          name: claim.claimed_by.name,
          first_name: claim.claimed_by.first_name,
          last_name: claim.claimed_by.last_name,
        })
    : null;

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.main}>
          <Text style={styles.date}>{dayLabel(row.date)}</Text>
          <Text style={styles.name}>{name}</Text>
          {mem ? (
            <View style={[styles.badge, hasNeed ? styles.badgeOk : styles.badgeWarn]}>
              <Text style={[styles.badgeText, hasNeed ? styles.badgeTextOk : styles.badgeTextWarn]}>
                {hasNeed ? 'Нужда' : 'Пусто'}
              </Text>
            </View>
          ) : null}
          {hasNeed && mem ? (
            <Text style={styles.needPreview} numberOfLines={2}>
              {needText(mem)}
            </Text>
          ) : null}
        </View>

        {mem && claim && !claimsError && coordinators.length > 0 ? (
          <Pressable
            onPress={onPickCurator}
            disabled={assignPending}
            style={({ pressed }) => [styles.curatorBtn, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.curatorLabel} numberOfLines={1}>
              {curatorLabel ?? 'Свободно'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>

      {mem ? (
        <>
          <Pressable onPress={onToggleExpand} style={styles.expandBtn}>
            <Text style={styles.expandText}>
              {expanded ? 'Скрыть' : hasNeed ? 'Редактировать нужду' : 'Добавить нужду'}
            </Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.textMuted}
            />
          </Pressable>
          {expanded ? (
            <View style={styles.editor}>
              <TextInput
                style={styles.textarea}
                value={prayerDraft}
                onChangeText={onDraftChange}
                multiline
                placeholder="О чём просим молиться в этот день цикла…"
                placeholderTextColor={colors.textMuted}
                maxLength={8000}
              />
              <Pressable
                onPress={onSavePrayer}
                disabled={savePending}
                style={({ pressed }) => [
                  styles.saveBtn,
                  pressed && { opacity: 0.9 },
                  savePending && { opacity: 0.6 },
                ]}
              >
                <Text style={styles.saveBtnText}>{savePending ? 'Сохранение…' : 'Сохранить'}</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function CoordinatorPickerModal({
  visible,
  coordinators,
  currentId,
  onClose,
  onSelect,
  colors,
}: {
  visible: boolean;
  coordinators: CycleCollectionCoordinatorRow[];
  currentId: number | null;
  onClose: () => void;
  onSelect: (id: number | null) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createModalStyles(colors), [colors]);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Ответственный за сбор</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        <Pressable
          onPress={() => onSelect(null)}
          style={({ pressed }) => [
            styles.option,
            currentId == null && styles.optionActive,
            pressed && { opacity: 0.9 },
          ]}
        >
          <Text style={styles.optionText}>Без ответственного</Text>
        </Pressable>
        {coordinators.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => onSelect(c.id)}
            style={({ pressed }) => [
              styles.option,
              currentId === c.id && styles.optionActive,
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={styles.optionText}>
              {memberRosterName({
                id: c.id,
                name: c.name,
                first_name: c.first_name,
                last_name: c.last_name,
              })}
            </Text>
          </Pressable>
        ))}
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    denied: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 8,
    },
    deniedTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
    deniedBody: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
    tabs: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginBottom: 8,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      padding: 4,
    },
    tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
    tabActive: { backgroundColor: colors.primary },
    tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
    tabTextActive: { color: colors.textOnPrimary, fontWeight: '700' },
    list: { paddingHorizontal: 16, paddingBottom: 32 },
    headerBlock: { gap: 10, marginBottom: 12 },
    distCard: {
      padding: 14,
      borderRadius: 14,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.08)',
    },
    distHint: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
    distBtn: {
      marginTop: 10,
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    distBtnText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 14 },
    distOk: { marginTop: 8, fontSize: 12, fontWeight: '600', color: '#0F6636' },
    stats: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.08)',
    },
    searchInput: { flex: 1, fontSize: 15, color: colors.text, padding: 0 },
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.08)',
    },
    filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterChipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    filterChipTextActive: { color: colors.textOnPrimary },
    warn: { fontSize: 12, color: '#b45309' },
    empty: { textAlign: 'center', color: colors.textMuted, marginTop: 24 },
  });
}

function createRowStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      marginBottom: 10,
      padding: 14,
      borderRadius: 14,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.08)',
    },
    top: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    main: { flex: 1, minWidth: 0 },
    date: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'capitalize' },
    name: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 2 },
    badge: {
      alignSelf: 'flex-start',
      marginTop: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    badgeOk: { backgroundColor: 'rgba(16,185,129,0.12)' },
    badgeWarn: { backgroundColor: 'rgba(245,158,11,0.12)' },
    badgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    badgeTextOk: { color: '#065f46' },
    badgeTextWarn: { color: '#92400e' },
    needPreview: { fontSize: 12, color: colors.textMuted, marginTop: 6, lineHeight: 17 },
    curatorBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      maxWidth: 120,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: `${colors.primary}10`,
    },
    curatorLabel: { flex: 1, fontSize: 11, fontWeight: '700', color: colors.primary },
    expandBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(28,25,23,0.08)',
    },
    expandText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
    editor: { marginTop: 10, gap: 10 },
    textarea: {
      minHeight: 100,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.1)',
      borderRadius: 10,
      padding: 12,
      fontSize: 14,
      color: colors.text,
      textAlignVertical: 'top',
      backgroundColor: colors.surface,
    },
    saveBtn: {
      alignSelf: 'flex-start',
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
    },
    saveBtnText: { color: colors.textOnPrimary, fontWeight: '700' },
  });
}

function createModalStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'rgba(28,25,23,0.08)',
    },
    title: { fontSize: 17, fontWeight: '700', color: colors.text },
    option: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'rgba(28,25,23,0.06)',
    },
    optionActive: { backgroundColor: `${colors.primary}12` },
    optionText: { fontSize: 15, fontWeight: '600', color: colors.text },
  });
}
