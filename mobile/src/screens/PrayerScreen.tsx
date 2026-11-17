import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchPrayerByDate, postPrayerSectionVisit } from '../api/prayer';
import {
  deleteCoordinatorNote,
  fetchCoordinatorNotes,
  type NoteKind,
} from '../api/prayerAdmin';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { PrayerDatePicker } from '../components/prayer/DatePicker';
import {
  BacksliderPrayerCard,
  MemberPrayerCard,
  MinistryPrayerCard,
  ThemePrayerCard,
} from '../components/prayer/PrayerDayCards';
import { NoteEditorModal } from '../components/prayer/NoteEditorModal';
import { TelegramDispatchModal } from '../components/prayer/TelegramDispatchModal';
import { UrgentPrayerCard } from '../components/prayer/UrgentPrayerCard';
import { PrayerViewersCard } from '../components/prayer/ViewersCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { usePrayerPlanAccess } from '../hooks/usePrayerPlanAccess';
import { todayIsoLocal } from '../lib/date';
import { storage } from '../lib/storage';
import { resolveApiOrigin } from '../lib/config';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import type { DayPrayerData } from '../types';
import { useTheme, type ThemeColors } from '../theme';

type PrayerNav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Prayer'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const PRAYER_VISIT_DATE_KEY = 'prayer_section_visit_date';

function isPrayerEmpty(data: DayPrayerData): boolean {
  return (
    data.members.length === 0 &&
    data.global_themes.length === 0 &&
    data.ministries.length === 0 &&
    data.backsliders.length === 0
  );
}

function memberSectionTitle(date: string, today: string): string {
  if (date < today) return 'Молитвенная нужда за этот день';
  if (date > today) return 'Молитвенная нужда (по очереди цикла)';
  return 'Сегодня молимся за члена церкви';
}

export function PrayerScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<PrayerNav>();
  const qc = useQueryClient();
  const {
    canManage: canManageCyclePlan,
    canManageNotes,
    canTelegram,
    canViewViewers,
  } = usePrayerPlanAccess();
  const [date, setDate] = useState(todayIsoLocal);
  const [editorKind, setEditorKind] = useState<NoteKind | null>(null);
  const [telegramOpen, setTelegramOpen] = useState(false);

  const prayerQuery = useQuery({
    queryKey: ['prayer', date],
    queryFn: () => fetchPrayerByDate(date),
  });

  const notesQuery = useQuery({
    queryKey: ['calendar', 'dashboard-coordinator-notes', date],
    queryFn: () => fetchCoordinatorNotes(date),
    staleTime: 0,
  });

  const deleteUrgent = useMutation({
    mutationFn: () => deleteCoordinatorNote('urgent_prayer', date),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['calendar', 'dashboard-coordinator-notes'] });
    },
    onError: (e: unknown) =>
      Alert.alert('Не удалось удалить', e instanceof Error ? e.message : 'Попробуйте ещё раз.'),
  });

  const confirmDeleteUrgent = () =>
    Alert.alert('Удалить срочную нужду?', 'Её перестанут показывать в приложении.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteUrgent.mutate() },
    ]);

  // Отметка о посещении раздела «Молитва» — не чаще раза в день (паритет с вебом).
  useFocusEffect(
    useCallback(() => {
      const today = todayIsoLocal();
      if (storage.getString(PRAYER_VISIT_DATE_KEY) === today) return;
      storage.set(PRAYER_VISIT_DATE_KEY, today);
      void postPrayerSectionVisit()
        .then(() => qc.invalidateQueries({ queryKey: ['calendar', 'prayer-section'] }))
        .catch(() => {
          storage.remove(PRAYER_VISIT_DATE_KEY);
        });
    }, [qc]),
  );

  const data = prayerQuery.data;
  const today = todayIsoLocal();
  const urgentText = notesQuery.data?.urgent_prayer?.text ?? '';

  const onRefresh = () => {
    void prayerQuery.refetch();
    void notesQuery.refetch();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Молитва" subtitle="Ежедневный молитвенный план" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={prayerQuery.isFetching && !prayerQuery.isPending}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <PrayerDatePicker value={date} onChange={setDate} />

        {canManageCyclePlan ? (
          <Pressable
            onPress={() => navigation.navigate('PrayerCyclePlan')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.92 }]}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="clipboard-outline" size={22} color={colors.textOnPrimary} />
            </View>
            <View style={styles.actionMeta}>
              <Text style={styles.actionTitle}>Сбор нужд · очередь недели</Text>
              <Text style={styles.actionSub}>
                Распределение участников цикла и назначение кураторов
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
          </Pressable>
        ) : null}

        {canTelegram ? (
          <Pressable
            onPress={() => setTelegramOpen(true)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.92 }]}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#2563eb' }]}>
              <Ionicons name="paper-plane-outline" size={22} color="#fff" />
            </View>
            <View style={styles.actionMeta}>
              <Text style={styles.actionTitle}>Рассылка в Telegram</Text>
              <Text style={styles.actionSub}>Молитва на выбранный день: расписание и получатели</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
          </Pressable>
        ) : null}

        {urgentText ? (
          <UrgentPrayerCard
            text={urgentText}
            canManage={canManageNotes}
            onEdit={() => setEditorKind('urgent_prayer')}
            onDelete={confirmDeleteUrgent}
          />
        ) : null}

        {canManageNotes ? (
          <View style={styles.noteButtons}>
            {!urgentText ? (
              <Pressable
                onPress={() => setEditorKind('urgent_prayer')}
                accessibilityRole="button"
                style={({ pressed }) => [styles.noteBtn, pressed && { opacity: 0.8 }]}
              >
                <Ionicons name="flame-outline" size={20} color={colors.primary} />
                <Text style={styles.noteBtnText}>Срочная нужда</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => setEditorKind('announcement')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.noteBtn, pressed && { opacity: 0.8 }]}
            >
              <Ionicons name="megaphone-outline" size={20} color={colors.primary} />
              <Text style={styles.noteBtnText}>Объявление</Text>
            </Pressable>
          </View>
        ) : null}

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
                  title={memberSectionTitle(date, today)}
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
                <SectionTitle
                  icon="heart-outline"
                  title="Молимся за отпавшего"
                  colors={colors}
                />
                {data.backsliders.map((b) => (
                  <BacksliderPrayerCard key={b.id} backslider={b} />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {data && isPrayerEmpty(data) ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={44} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>На этот день план не заполнен</Text>
            <Text style={styles.emptyBody}>
              Выберите другую дату или обратитесь к координатору молитвы.
            </Text>
          </View>
        ) : null}

        <PrayerViewersCard enabled={canViewViewers} />
      </ScrollView>

      <NoteEditorModal kind={editorKind} onClose={() => setEditorKind(null)} />
      {canTelegram ? (
        <TelegramDispatchModal
          visible={telegramOpen}
          onClose={() => setTelegramOpen(false)}
          dateYmd={date}
        />
      ) : null}
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
    <View
      accessibilityRole="header"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: `${colors.primary}1A`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <Text
        style={{ flex: 1, fontSize: 19, lineHeight: 25, fontWeight: '800', color: colors.text }}
      >
        {title}
      </Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40, gap: 14 },
    actionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      minHeight: 72,
      borderRadius: colors.radius,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: `${colors.primary}40`,
    },
    actionIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionMeta: { flex: 1, minWidth: 0 },
    actionTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
    actionSub: { fontSize: 14, color: colors.textSecondary, marginTop: 2, lineHeight: 20 },
    noteButtons: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    noteBtn: {
      flexGrow: 1,
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: `${colors.primary}66`,
    },
    noteBtnText: { fontSize: 16, fontWeight: '700', color: colors.primary },
    cards: { gap: 8 },
    section: { marginBottom: 8 },
    empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 8 },
    emptyTitle: {
      fontSize: 19,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    emptyBody: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
    },
  });
}
