import { StyleSheet, Text, View } from 'react-native';

import { ChatAvatar } from './ChatAvatar';

type Props = {
  title: string;
  subtitle: string;
  /** Подзаголовок подсвечивается, когда человек в сети или печатает. */
  accent: boolean;
  avatarUrl: string | null;
  avatarSeed: string;
  isOnline: boolean;
  showOnline: boolean;
  textColor: string;
  subtitleColor: string;
  accentColor: string;
};

/** Шапка чата как в Telegram: аватар, имя и статус («в сети», «печатает…», «5 участников»). */
export function ChatHeaderTitle({
  title,
  subtitle,
  accent,
  avatarUrl,
  avatarSeed,
  isOnline,
  showOnline,
  textColor,
  subtitleColor,
  accentColor,
}: Props) {
  return (
    <View style={styles.row} accessibilityRole="header">
      <ChatAvatar
        name={title}
        imageUrl={avatarUrl}
        seed={avatarSeed}
        size={38}
        showOnline={showOnline}
        isOnline={isOnline}
      />
      <View style={styles.texts}>
        <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
          {title}
        </Text>
        <Text
          style={[styles.subtitle, { color: accent ? accentColor : subtitleColor }]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 240 },
  texts: { flexShrink: 1 },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 1 },
});
