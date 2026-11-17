import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  formatBirthdayDate,
  initialsOf,
  type BirthdayWithStatus,
} from '../../lib/dashboardHome';
import { useTheme, type ThemeColors } from '../../theme';
import { SectionLabel } from './SectionLabel';

const AVATAR_PALETTE = [
  { bg: '#FDE8E8', fg: '#7D3640' },
  { bg: '#EEEDFE', fg: '#4A3AAA' },
  { bg: '#E1F5EE', fg: '#0B6E56' },
  { bg: '#FAEEDA', fg: '#854F0B' },
  { bg: '#F4C0D1', fg: '#72243E' },
] as const;

function paletteFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]!;
}

export function BirthdayCard({
  items,
  onMessage,
}: {
  items: BirthdayWithStatus[];
  onMessage: (memberId: number) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <SectionLabel>Дни рождения</SectionLabel>
      <View style={styles.card}>
        {items.map((person, i) => {
          const pal = paletteFor(person.name);
          return (
            <View
              key={person.id}
              style={[styles.row, i < items.length - 1 && styles.rowDivider]}
            >
              <View style={[styles.avatar, { backgroundColor: pal.bg }]}>
                <Text style={[styles.avatarText, { color: pal.fg }]}>
                  {initialsOf(person.name)}
                </Text>
              </View>
              <View style={styles.meta}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {person.name}
                  </Text>
                  {person.status !== 'soon' ? (
                    <View
                      style={[
                        styles.pill,
                        person.status === 'today' ? styles.pillToday : styles.pillTomorrow,
                      ]}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          person.status === 'today' && { color: colors.textOnPrimary },
                        ]}
                      >
                        {person.status === 'today' ? 'Сегодня' : 'Завтра'}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.date}>{formatBirthdayDate(person.week_date)}</Text>
              </View>
              <Pressable
                onPress={() => onMessage(person.id)}
                accessibilityRole="button"
                accessibilityLabel={`Написать поздравление: ${person.name}`}
                hitSlop={4}
                style={({ pressed }) => [
                  styles.msgBtn,
                  { backgroundColor: pal.bg },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={20} color={pal.fg} />
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { gap: 8 },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius + 4,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.textMuted + '55',
    },
    avatar: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { fontSize: 15, fontWeight: '700' },
    meta: { flex: 1, minWidth: 0 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    name: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: colors.text },
    pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
    pillToday: { backgroundColor: colors.primary },
    pillTomorrow: { backgroundColor: colors.primary + '29' },
    pillText: { fontSize: 10, fontWeight: '700', color: colors.primary },
    date: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    msgBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
