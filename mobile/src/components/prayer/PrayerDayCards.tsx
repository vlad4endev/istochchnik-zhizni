import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { patchProfilePrayerRequest } from '../../api/profile';
import { memberRosterName } from '../../lib/memberRosterName';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../theme';
import type { Backslider, GlobalTheme, Member, Ministry } from '../../types';
import {
  PrayerBodyText,
  PrayerCard,
  PrayerHighlightBox,
  PrayerMutedText,
} from './PrayerCard';

export function MemberPrayerCard({
  member,
  dateKey,
}: {
  member: Member;
  dateKey: string;
}) {
  const { colors } = useTheme();
  const memberId = useAuthStore((s) => s.memberId);
  const isMe = memberId != null && member.id === memberId;
  const [text, setText] = useState(member.prayer_request ?? '');
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    setText(member.prayer_request ?? '');
  }, [member.id, member.prayer_request]);

  const saveMutation = useMutation({
    mutationFn: () => patchProfilePrayerRequest(text),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['prayer', dateKey] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const hasRequest = (member.prayer_request ?? '').trim().length > 0;

  return (
    <PrayerCard
      icon="heart-outline"
      label="Член церкви"
      title={memberRosterName(member)}
      accentColor={colors.member}
    >
      {isMe ? (
        <View style={{ gap: 10 }}>
          <Text style={styles.fieldLabel}>Ваша молитвенная нужда</Text>
          <TextInput
            style={[
              styles.textarea,
              {
                color: colors.text,
                backgroundColor: colors.surface,
                borderColor: 'rgba(28,25,23,0.12)',
              },
            ]}
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={5}
            placeholder="О чём просим молиться…"
            placeholderTextColor={colors.textMuted}
            textAlignVertical="top"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            onPress={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: colors.primary },
              pressed && { backgroundColor: colors.primaryDark },
            ]}
          >
            {saveMutation.isPending ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={[styles.saveBtnText, { color: colors.textOnPrimary }]}>
                Сохранить
              </Text>
            )}
          </Pressable>
        </View>
      ) : hasRequest ? (
        <PrayerBodyText>{member.prayer_request!.trim()}</PrayerBodyText>
      ) : (
        <PrayerMutedText>Нет указанных нужд</PrayerMutedText>
      )}
    </PrayerCard>
  );
}

export function ThemePrayerCard({ theme }: { theme: GlobalTheme }) {
  const { colors } = useTheme();
  const hasVerse = Boolean(theme.bible_verse?.trim());
  const hasPoints = Boolean(theme.prayer_points?.trim());

  return (
    <PrayerCard
      icon="book-outline"
      label="Тема"
      title={theme.title.trim() || 'Тема не указана'}
      accentColor={colors.theme}
    >
      {hasVerse ? (
        <PrayerHighlightBox icon="bookmark-outline" accentColor={colors.theme}>
          {theme.bible_verse!.trim()}
        </PrayerHighlightBox>
      ) : null}
      {hasPoints ? (
        <PrayerBodyText>{theme.prayer_points!.trim()}</PrayerBodyText>
      ) : null}
      {!hasVerse && !hasPoints ? (
        <PrayerMutedText>Нет дополнительной информации</PrayerMutedText>
      ) : null}
    </PrayerCard>
  );
}

export function MinistryPrayerCard({ ministry }: { ministry: Ministry }) {
  const { colors } = useTheme();
  const hasPoints = Boolean(ministry.prayer_points?.trim());
  const title = ministry.title.trim() || 'Служение';

  return (
    <PrayerCard icon="construct-outline" label="Служение" title={title} accentColor={colors.ministry}>
      {hasPoints ? (
        <PrayerBodyText>{ministry.prayer_points!.trim()}</PrayerBodyText>
      ) : (
        <PrayerMutedText>Нет указанных пунктов молитвы</PrayerMutedText>
      )}
    </PrayerCard>
  );
}

export function BacksliderPrayerCard({ backslider }: { backslider: Backslider }) {
  const { colors } = useTheme();

  return (
    <PrayerCard
      icon="person-remove-outline"
      label="Отпавшие"
      title={backslider.name.trim() || 'Не указан'}
      accentColor={colors.backslider}
    >
      <PrayerMutedText>Отпавший — нуждается в молитве о возвращении</PrayerMutedText>
    </PrayerCard>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#78716c',
  },
  textarea: {
    minHeight: 110,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 22,
  },
  error: {
    fontSize: 13,
    color: '#b91c1c',
  },
  saveBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 120,
    alignItems: 'center',
  },
  saveBtnText: {
    fontWeight: '700',
    fontSize: 15,
  },
});
