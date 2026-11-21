import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatApiError } from '../../api/client';
import { updateMediaAssignmentStatus } from '../../api/mediaSchedule';
import { updateMusicAssignmentStatus } from '../../api/musicSchedule';
import {
  isPendingStatus,
  type RoleStatus,
  type ServiceMinistry,
  type ServiceWeekCard,
} from '../../hooks/useMyServiceWeek';
import { useTheme, type ThemeColors } from '../../theme';
import { SectionLabel } from './SectionLabel';

const MINISTRY_META: Record<ServiceMinistry, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  sunday: { label: 'Собрание', icon: 'people-outline' },
  music: { label: 'Прославление', icon: 'musical-notes-outline' },
  media: { label: 'Трансляция', icon: 'videocam-outline' },
};

const SIDEBAR = '#6B1E32';

function aggregateStatus(roles: ServiceWeekCard['roles']): RoleStatus {
  if (roles.some((r) => isPendingStatus(r.status))) return 'pending';
  if (roles.some((r) => r.status === 'declined')) return 'declined';
  if (roles.length > 0 && roles.every((r) => r.status === 'confirmed')) return 'confirmed';
  return 'info';
}

function formatTime(raw: string | null): string | null {
  const m = raw?.trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1]!.padStart(2, '0')}:${m[2]}` : null;
}

function Card({ card, colors }: { card: ServiceWeekCard; colors: ThemeColors }) {
  const qc = useQueryClient();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const meta = MINISTRY_META[card.ministry];
  const status = aggregateStatus(card.roles);
  const pending = card.roles.filter((r) => isPendingStatus(r.status) && r.assignmentId != null);

  const mutation = useMutation({
    mutationFn: async (next: 'confirmed' | 'declined') => {
      const update =
        card.ministry === 'music' ? updateMusicAssignmentStatus : updateMediaAssignmentStatus;
      await Promise.all(pending.map((r) => update(r.assignmentId!, next)));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['music-schedule'] });
      void qc.invalidateQueries({ queryKey: ['media-schedule'] });
    },
  });

  const date = parseISO(card.eventDate);
  const valid = !Number.isNaN(date.getTime());
  const time = formatTime(card.startTime);

  const badge =
    status === 'confirmed'
      ? { text: 'Подтверждено', color: '#1E8A4C' }
      : status === 'declined'
        ? { text: 'Отклонено', color: '#B42318' }
        : status === 'pending'
          ? { text: 'Ждёт ответа', color: '#B54708' }
          : null;

  return (
    <View style={styles.card}>
      <View style={styles.sidebar}>
        <Text style={styles.sbWeekday}>
          {valid ? format(date, 'EEEEEE', { locale: ru }).toUpperCase() : 'ВС'}
        </Text>
        <Text style={styles.sbDay}>{valid ? format(date, 'd') : '—'}</Text>
        <Text style={styles.sbMonth}>{valid ? format(date, 'LLLL', { locale: ru }) : ''}</Text>
      </View>
      <View style={styles.main}>
        <View style={styles.headRow}>
          <Ionicons name={meta.icon} size={16} color={colors.textMuted} />
          <Text style={styles.ministry}>{meta.label}</Text>
          {badge ? (
            <View style={[styles.badge, { backgroundColor: badge.color + '1F' }]}>
              <Text style={[styles.badgeText, { color: badge.color }]}>{badge.text}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {card.title}
          {time ? ` · ${time}` : ''}
        </Text>
        <Text style={styles.roles}>Служение: {card.roles.map((r) => r.roleName).join(', ')}</Text>

        {pending.length > 0 ? (
          <View style={styles.actions}>
            <Pressable
              disabled={mutation.isPending}
              onPress={() => mutation.mutate('confirmed')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && { opacity: 0.85 }]}
            >
              {mutation.isPending ? (
                <ActivityIndicator size="small" color={colors.textOnPrimary} />
              ) : (
                <Text style={styles.btnPrimaryText}>
                  {pending.length > 1 ? 'Подтвердить все' : 'Подтвердить'}
                </Text>
              )}
            </Pressable>
            <Pressable
              disabled={mutation.isPending}
              onPress={() => mutation.mutate('declined')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.btnGhostText}>Не смогу</Text>
            </Pressable>
          </View>
        ) : null}
        {mutation.isError ? (
          <Text style={styles.error}>
            Не удалось сохранить ответ: {formatApiError(mutation.error)}. Попробуйте ещё раз.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function MyServiceWeekCard({ cards }: { cards: ServiceWeekCard[] }) {
  const { colors } = useTheme();
  if (cards.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      <SectionLabel>Твоё служение на этой неделе</SectionLabel>
      {cards.map((c) => (
        <Card key={c.key} card={c} colors={colors} />
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius + 4,
      overflow: 'hidden',
    },
    sidebar: {
      width: 74,
      backgroundColor: SIDEBAR,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
    },
    sbWeekday: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
    sbDay: { fontSize: 32, fontWeight: '800', color: '#fff', lineHeight: 38 },
    sbMonth: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.9)', textTransform: 'capitalize' },
    main: { flex: 1, minWidth: 0, padding: 14, gap: 4 },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    ministry: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
    badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
    badgeText: { fontSize: 11, fontWeight: '700' },
    title: { fontSize: 16, fontWeight: '800', color: colors.text },
    roles: { fontSize: 14, color: colors.textSecondary },
    actions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
    btn: {
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnPrimary: { backgroundColor: colors.primary },
    btnPrimaryText: { color: colors.textOnPrimary, fontWeight: '800', fontSize: 14 },
    btnGhost: { borderWidth: 1, borderColor: colors.textMuted + '88' },
    btnGhostText: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },
    error: { marginTop: 6, fontSize: 12, color: '#B42318' },
  });
}
