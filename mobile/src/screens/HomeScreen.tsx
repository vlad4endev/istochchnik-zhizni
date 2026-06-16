import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchPrayerByDate } from '../api/prayer';
import { formatDisplayDate, todayIsoUtc } from '../lib/date';
import { memberRosterName } from '../lib/memberRosterName';
import { getApiBaseUrl } from '../lib/storage';
import { useTheme, type ThemeColors } from '../theme';
import type { DayPrayerData } from '../types';

const ANDROID_EMULATOR_HOST = 'http://10.0.2.2:40978';

function apiHintLabel(): string {
  const base = getApiBaseUrl().trim();
  if (base !== '') return base;
  if (Platform.OS === 'android') return ANDROID_EMULATOR_HOST;
  return 'http://localhost:40978';
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    header: {
      backgroundColor: colors.primary,
      padding: 16,
    },
    title: {
      color: colors.textOnPrimary,
      fontSize: 22,
      fontWeight: '700',
    },
    main: {
      flex: 1,
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 32,
    },
    dateRow: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      paddingHorizontal: 20,
      paddingVertical: 16,
      marginBottom: 20,
      shadowColor: '#1c1917',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.06,
      shadowRadius: 24,
      elevation: 3,
    },
    dateLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      marginBottom: 12,
    },
    dateControls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    dateArrow: {
      width: 44,
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: 'rgba(28, 25, 23, 0.12)',
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateCaption: {
      flex: 1,
      textAlign: 'center',
      fontWeight: '700',
      fontSize: 16,
      color: colors.text,
    },
    state: {
      alignItems: 'center',
      paddingVertical: 32,
      paddingHorizontal: 16,
    },
    stateLoadingText: {
      marginTop: 12,
      color: colors.textSecondary,
      fontSize: 15,
    },
    stateError: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      shadowColor: '#1c1917',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.06,
      shadowRadius: 24,
      elevation: 3,
    },
    stateTitle: {
      fontWeight: '700',
      fontSize: 16,
      color: colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    stateMsg: {
      color: colors.textSecondary,
      fontSize: 14,
      marginBottom: 12,
      textAlign: 'center',
    },
    stateHint: {
      fontSize: 13,
      color: colors.textMuted,
      marginBottom: 16,
      textAlign: 'center',
    },
    stateHintCode: {
      fontSize: 12,
    },
    btnRetry: {
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 12,
    },
    btnRetryPressed: {
      backgroundColor: colors.primaryDark,
    },
    btnRetryText: {
      color: colors.textOnPrimary,
      fontWeight: '700',
      fontSize: 15,
    },
    cards: {
      gap: 16,
    },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      paddingHorizontal: 22,
      paddingVertical: 20,
      borderLeftWidth: 4,
      shadowColor: '#1c1917',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.06,
      shadowRadius: 24,
      elevation: 3,
    },
    cardMember: {
      borderLeftColor: colors.member,
    },
    cardTheme: {
      borderLeftColor: colors.theme,
    },
    cardMinistry: {
      borderLeftColor: colors.ministry,
    },
    cardBackslider: {
      borderLeftColor: colors.backslider,
    },
    cardLabel: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.66,
      textTransform: 'uppercase',
      color: colors.textMuted,
      marginBottom: 6,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
      marginBottom: 8,
    },
    cardVerse: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    cardVerseText: {
      flex: 1,
      color: colors.textSecondary,
      fontSize: 15,
    },
    cardBodyRow: {
      flexDirection: 'row',
      gap: 8,
    },
    cardBody: {
      color: colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
    },
    cardBodyFlex: {
      flex: 1,
    },
    iconMuted: {
      opacity: 0.7,
      marginTop: 2,
    },
  });
}

export function HomeScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [date, setDate] = useState(todayIsoUtc);
  const [data, setData] = useState<DayPrayerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchPrayerByDate(d);
      setData(json);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(date);
  }, [date, load]);

  const prevDay = () =>
    setDate((d) => {
      const dt = new Date(`${d}T12:00:00Z`);
      dt.setUTCDate(dt.getUTCDate() - 1);
      return dt.toISOString().slice(0, 10);
    });

  const nextDay = () =>
    setDate((d) => {
      const dt = new Date(`${d}T12:00:00Z`);
      dt.setUTCDate(dt.getUTCDate() + 1);
      return dt.toISOString().slice(0, 10);
    });

  const member = data?.members[0];
  const theme = data?.global_themes[0];
  const ministry = data?.ministries[0];
  const backslider = data?.backsliders[0];

  const apiHint = useMemo(() => apiHintLabel(), []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Молитва</Text>
      </View>

      <ScrollView style={styles.main} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.dateRow}>
          <Text style={styles.dateLabel}>Дата</Text>
          <View style={styles.dateControls}>
            <Pressable
              onPress={prevDay}
              style={({ pressed }) => [styles.dateArrow, pressed && { opacity: 0.7 }]}
              accessibilityLabel="Предыдущий день"
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
            <Text style={styles.dateCaption}>{formatDisplayDate(date)}</Text>
            <Pressable
              onPress={nextDay}
              style={({ pressed }) => [styles.dateArrow, pressed && { opacity: 0.7 }]}
              accessibilityLabel="Следующий день"
            >
              <Ionicons name="chevron-forward" size={22} color={colors.text} />
            </Pressable>
          </View>
        </View>

        {loading && (
          <View style={styles.state}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.stateLoadingText}>Загрузка…</Text>
          </View>
        )}

        {!loading && error && (
          <View style={[styles.state, styles.stateError]}>
            <Text style={styles.stateTitle}>Не удалось загрузить данные</Text>
            <Text style={styles.stateMsg}>{error}</Text>
            <Text style={styles.stateHint}>
              API: <Text style={styles.stateHintCode}>{apiHint}</Text>
            </Text>
            <Pressable
              onPress={() => void load(date)}
              style={({ pressed }) => [styles.btnRetry, pressed && styles.btnRetryPressed]}
            >
              <Text style={styles.btnRetryText}>Повторить</Text>
            </Pressable>
          </View>
        )}

        {!loading && !error && data && (
          <View style={styles.cards}>
            <View style={[styles.card, styles.cardMember]}>
              <Text style={styles.cardLabel}>Член церкви</Text>
              <Text style={styles.cardTitle}>
                {member ? memberRosterName(member) : 'Не назначен'}
              </Text>
              <Text style={styles.cardBody}>
                {(member?.prayer_request?.trim() || 'Нужда не указана').trim()}
              </Text>
            </View>

            <View style={[styles.card, styles.cardTheme]}>
              <Text style={styles.cardLabel}>Тема</Text>
              <Text style={styles.cardTitle}>
                {(theme?.title?.trim() || 'Тема не указана').toUpperCase()}
              </Text>
              <View style={styles.cardVerse}>
                <Ionicons
                  name="book-outline"
                  size={16}
                  color={colors.textSecondary}
                  style={styles.iconMuted}
                />
                <Text style={styles.cardVerseText}>
                  {(theme?.bible_verse?.trim() || 'Стих не указан').trim()}
                </Text>
              </View>
              <View style={styles.cardBodyRow}>
                <Ionicons
                  name="heart-outline"
                  size={16}
                  color={colors.textSecondary}
                  style={styles.iconMuted}
                />
                <Text style={[styles.cardBody, styles.cardBodyFlex]}>
                  {(theme?.prayer_points?.trim() || 'Пункты молитвы не указаны').trim()}
                </Text>
              </View>
            </View>

            <View style={[styles.card, styles.cardMinistry]}>
              <Text style={styles.cardLabel}>Служение</Text>
              <View style={styles.cardBodyRow}>
                <Ionicons
                  name="construct-outline"
                  size={16}
                  color={colors.textSecondary}
                  style={styles.iconMuted}
                />
                <Text style={[styles.cardBody, styles.cardBodyFlex]}>
                  {(
                    ministry?.prayer_points?.trim() ||
                    ministry?.title?.trim() ||
                    'Служение не указано'
                  ).trim()}
                </Text>
              </View>
            </View>

            <View style={[styles.card, styles.cardBackslider]}>
              <Text style={styles.cardLabel}>Отпавшие</Text>
              <View style={styles.cardBodyRow}>
                <Ionicons
                  name="location-outline"
                  size={16}
                  color={colors.textSecondary}
                  style={styles.iconMuted}
                />
                <Text style={[styles.cardBody, styles.cardBodyFlex]}>
                  {(backslider?.name ?? 'Не указан').trim()}
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
