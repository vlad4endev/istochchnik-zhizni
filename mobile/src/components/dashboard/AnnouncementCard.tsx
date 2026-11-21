import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../theme';

const COLLAPSED_LINES = 4;

export function AnnouncementCard({ text, onEdit }: { text: string; onEdit?: () => void }) {
  const { isDark } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const styles = useMemo(() => createStyles(isDark), [isDark]);

  return (
    <View style={styles.card} accessibilityLabel="Объявление">
      <View style={styles.head}>
        <Text style={styles.label}>Объявление</Text>
        {onEdit ? (
          <Pressable onPress={onEdit} accessibilityRole="button" style={styles.edit}>
            <Text style={styles.moreText}>Изменить</Text>
          </Pressable>
        ) : null}
      </View>
      <Text
        style={styles.text}
        numberOfLines={expanded ? undefined : COLLAPSED_LINES}
        onTextLayout={(e) => {
          if (!expanded) setTruncated(e.nativeEvent.lines.length > COLLAPSED_LINES);
        }}
      >
        {text}
      </Text>
      {truncated || expanded ? (
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          style={styles.more}
        >
          <Text style={styles.moreText}>{expanded ? 'Свернуть' : 'Читать полностью'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(isDark: boolean) {
  const ink = isDark ? '#FCE9C2' : '#3D2800';
  const accent = isDark ? '#F2B65A' : '#9A6200';
  return StyleSheet.create({
    card: {
      borderRadius: 18,
      padding: 16,
      backgroundColor: isDark ? '#3A2D14' : '#FFF4DE',
      borderWidth: 1,
      borderColor: isDark ? '#6B5220' : '#F5D99A',
    },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    edit: { minHeight: 44, justifyContent: 'center' },
    label: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4, color: accent },
    text: { marginTop: 8, fontSize: 17, fontWeight: '600', lineHeight: 25, color: ink },
    more: { marginTop: 4, minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
    moreText: { fontSize: 14, fontWeight: '700', color: accent, textDecorationLine: 'underline' },
  });
}
