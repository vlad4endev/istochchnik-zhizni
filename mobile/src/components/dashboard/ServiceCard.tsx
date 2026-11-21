import { Image } from 'expo-image';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { initialsOf } from '../../lib/dashboardHome';
import { useTheme, type ThemeColors } from '../../theme';

export type ServicePerson = {
  memberId: number;
  name: string;
  avatarUrl: string | null;
};

type Props = {
  dateLabel: string;
  preacher: ServicePerson;
  host: ServicePerson | null;
  topic: string;
  scripture: string;
  currentMemberId: number | null;
  onMessage: (memberId: number) => void;
};

const BAND = '#6B1E32';

function Person({
  role,
  person,
  roleColor,
  canMessage,
  onMessage,
  colors,
}: {
  role: string;
  person: ServicePerson;
  roleColor: string;
  canMessage: boolean;
  onMessage: () => void;
  colors: ThemeColors;
}) {
  return (
    <View style={personStyles.row}>
      <View style={[personStyles.avatar, { backgroundColor: roleColor }]}>
        {person.avatarUrl ? (
          <Image source={{ uri: person.avatarUrl }} style={personStyles.img} contentFit="cover" />
        ) : (
          <Text style={personStyles.initials}>{initialsOf(person.name)}</Text>
        )}
      </View>
      <View style={personStyles.text}>
        <Text style={[personStyles.role, { color: roleColor }]}>{role}</Text>
        <Text style={[personStyles.name, { color: colors.text }]} numberOfLines={2}>
          {person.name}
        </Text>
      </View>
      {canMessage ? (
        <Pressable
          onPress={onMessage}
          accessibilityRole="button"
          accessibilityLabel={`Написать: ${person.name}`}
          style={({ pressed }) => [
            personStyles.chat,
            { borderColor: roleColor },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={[personStyles.chatText, { color: roleColor }]}>Написать</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const personStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  img: { width: 48, height: 48 },
  initials: { color: '#fff', fontWeight: '700', fontSize: 16 },
  text: { flex: 1, minWidth: 0 },
  role: { fontSize: 10.5, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  name: { fontSize: 16, fontWeight: '700', marginTop: 1 },
  chat: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatText: { fontSize: 13, fontWeight: '700' },
});

export function ServiceCard({
  dateLabel,
  preacher,
  host,
  topic,
  scripture,
  currentMemberId,
  onMessage,
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  return (
    <View style={styles.card} accessibilityLabel="Карточка богослужения">
      <View style={styles.band}>
        <Text style={styles.eyebrow}>БОГОСЛУЖЕНИЕ</Text>
        <Text style={styles.date}>{dateLabel}</Text>
      </View>
      <View style={styles.body}>
        <Person
          role="Проповедник"
          person={preacher}
          roleColor={isDark ? '#D97787' : '#7B2A3E'}
          canMessage={currentMemberId !== preacher.memberId}
          onMessage={() => onMessage(preacher.memberId)}
          colors={colors}
        />
        {host ? (
          <View style={styles.hostWrap}>
            <Person
              role="Ведущий"
              person={host}
              roleColor={isDark ? '#E0B35C' : '#A07A25'}
              canMessage={currentMemberId !== host.memberId}
              onMessage={() => onMessage(host.memberId)}
              colors={colors}
            />
          </View>
        ) : null}
        <View style={styles.divider} />
        <Text style={styles.topic}>«{topic}»</Text>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{scripture}</Text>
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    card: {
      borderRadius: colors.radius + 6,
      overflow: 'hidden',
      backgroundColor: isDark ? colors.surfaceElevated : '#F6EDE0',
    },
    band: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 13,
      backgroundColor: BAND,
    },
    eyebrow: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 1.6 },
    date: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: '500', flexShrink: 1 },
    body: { padding: 16, gap: 0 },
    hostWrap: { marginTop: 12 },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.textMuted + '66',
      marginVertical: 14,
    },
    topic: {
      fontSize: 22,
      lineHeight: 28,
      fontStyle: 'italic',
      fontWeight: '600',
      color: colors.text,
    },
    tag: {
      alignSelf: 'flex-start',
      marginTop: 10,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.primary + '40',
    },
    tagText: { fontSize: 12.5, fontWeight: '600', color: colors.primary },
  });
}
