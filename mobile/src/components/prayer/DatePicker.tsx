import { Ionicons } from '@expo/vector-icons';
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { isTodayIso, todayIsoLocal } from '../../lib/date';
import { useTheme, type ThemeColors } from '../../theme';

const WEEK_OPTS = { weekStartsOn: 1 as const };
const toIso = (d: Date) => format(d, 'yyyy-MM-dd');

type Props = { value: string; onChange: (iso: string) => void };

/** Выбор дня: свёрнутая «плашка» с датой, внутри — неделя или месяц (как на вебе). */
export function PrayerDatePicker({ value, onChange }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<'week' | 'month'>('week');
  const selected = parseISO(value);
  const isToday = isTodayIso(value);

  const pick = (d: Date) => {
    onChange(toIso(d));
    setExpanded(false);
  };

  const weekDays = eachDayOfInterval({
    start: startOfWeek(selected, WEEK_OPTS),
    end: endOfWeek(selected, WEEK_OPTS),
  });
  const monthDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(selected), WEEK_OPTS),
    end: endOfWeek(endOfMonth(selected), WEEK_OPTS),
  });
  const weekdayHeads = weekDays.map((d) => format(d, 'EEEEEE', { locale: ru }));

  const stepBack = () => onChange(toIso(view === 'week' ? addWeeks(selected, -1) : addMonths(selected, -1)));
  const stepForward = () => onChange(toIso(view === 'week' ? addWeeks(selected, 1) : addMonths(selected, 1)));

  const renderDay = (d: Date, dimmed = false) => {
    const iso = toIso(d);
    const isSel = iso === value;
    const isNow = iso === todayIsoLocal();
    return (
      <Pressable
        key={iso}
        onPress={() => pick(d)}
        accessibilityRole="button"
        accessibilityState={{ selected: isSel }}
        accessibilityLabel={format(d, 'd MMMM, EEEE', { locale: ru })}
        style={[styles.day, isSel && styles.daySelected]}
      >
        <Text
          style={[
            styles.dayText,
            dimmed && { opacity: 0.45 },
            isNow && !isSel && { color: colors.primary, fontWeight: '800' },
            isSel && { color: colors.textOnPrimary, fontWeight: '800' },
          ]}
        >
          {format(d, 'd')}
        </Text>
      </Pressable>
    );
  };

  return (
    <View>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel="Выбрать дату"
        style={({ pressed }) => [styles.chip, pressed && { opacity: 0.92 }]}
      >
        <View style={styles.chipIcon}>
          <Ionicons name="calendar-outline" size={22} color={colors.primary} />
        </View>
        <Text style={styles.chipText} numberOfLines={1}>
          {format(selected, 'd MMMM yyyy', { locale: ru })}
        </Text>
        {isToday ? (
          <View style={styles.todayBadge}>
            <Text style={styles.todayBadgeText}>СЕГОДНЯ</Text>
          </View>
        ) : null}
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={24}
          color={colors.textSecondary}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.panel}>
          <View style={styles.navRow}>
            <Pressable
              onPress={stepBack}
              accessibilityLabel={view === 'week' ? 'Предыдущая неделя' : 'Предыдущий месяц'}
              style={styles.navBtn}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </Pressable>
            <Text style={styles.navTitle}>
              {view === 'week'
                ? `${format(weekDays[0]!, 'd MMM', { locale: ru })} – ${format(weekDays[6]!, 'd MMM', { locale: ru })}`
                : format(selected, 'LLLL yyyy', { locale: ru })}
            </Text>
            <Pressable
              onPress={stepForward}
              accessibilityLabel={view === 'week' ? 'Следующая неделя' : 'Следующий месяц'}
              style={styles.navBtn}
            >
              <Ionicons name="chevron-forward" size={24} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {weekdayHeads.map((h, i) => (
              <Text key={i} style={styles.weekHead}>
                {h}
              </Text>
            ))}
          </View>

          {view === 'week' ? (
            <View style={styles.weekRow}>{weekDays.map((d) => renderDay(d))}</View>
          ) : (
            <View style={styles.grid}>
              {monthDays.map((d) => renderDay(d, d.getMonth() !== selected.getMonth()))}
            </View>
          )}

          <View style={styles.footer}>
            <Pressable
              onPress={() => setView((v) => (v === 'week' ? 'month' : 'week'))}
              accessibilityRole="button"
              style={styles.footBtn}
            >
              <Ionicons
                name={view === 'week' ? 'calendar-number-outline' : 'calendar-outline'}
                size={20}
                color={colors.primary}
              />
              <Text style={styles.footBtnText}>{view === 'week' ? 'Весь месяц' : 'Неделя'}</Text>
            </Pressable>
            {!isToday ? (
              <Pressable onPress={() => pick(new Date())} accessibilityRole="button" style={styles.footBtn}>
                <Ionicons name="today-outline" size={20} color={colors.primary} />
                <Text style={styles.footBtnText}>Сегодня</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    chip: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      borderRadius: 28,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.textMuted + '55',
    },
    chipIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: colors.primary + '1A',
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipText: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.text },
    todayBadge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: colors.primary + '24',
    },
    todayBadgeText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, color: colors.primary },
    panel: {
      marginTop: 8,
      borderRadius: colors.radius + 4,
      backgroundColor: colors.surfaceElevated,
      padding: 12,
      gap: 8,
    },
    navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    navBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    navTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      textTransform: 'capitalize',
    },
    weekRow: { flexDirection: 'row' },
    weekHead: {
      flex: 1,
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    day: {
      width: `${100 / 7}%`,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 24,
    },
    daySelected: { backgroundColor: colors.primary },
    dayText: { fontSize: 17, fontWeight: '600', color: colors.text },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.textMuted + '66',
      paddingTop: 6,
    },
    footBtn: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
    },
    footBtnText: { fontSize: 16, fontWeight: '700', color: colors.primary },
  });
}
