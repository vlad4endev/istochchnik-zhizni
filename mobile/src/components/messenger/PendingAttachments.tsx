import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatDurationSec, formatFileSize, type AttachmentDraft } from '../../lib/attachments';
import { useTheme, type ThemeColors } from '../../theme';

type Props = {
  items: AttachmentDraft[];
  onRemove: (index: number) => void;
  disabled?: boolean;
};

/** Выбранные, но ещё не отправленные вложения: миниатюры и чипы файлов с кнопкой «убрать». */
export function PendingAttachments({ items, onRemove, disabled }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (items.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {items.map((it, i) => (
        <View key={`${it.uri}-${i}`} style={styles.item}>
          {it.kind === 'image' || it.kind === 'video' ? (
            <View style={styles.thumbWrap}>
              <Image source={{ uri: it.uri }} style={styles.thumb} contentFit="cover" />
              {it.kind === 'video' ? (
                <View style={styles.videoBadge}>
                  <Ionicons name="play" size={14} color="#fff" />
                  {it.durationSec ? (
                    <Text style={styles.videoText}>{formatDurationSec(it.durationSec)}</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.fileChip}>
              <Ionicons
                name={it.kind === 'audio' ? 'musical-notes' : 'document-text'}
                size={22}
                color={colors.primary}
              />
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {it.name}
                </Text>
                <Text style={styles.fileSize}>{formatFileSize(it.size)}</Text>
              </View>
            </View>
          )}
          <Pressable
            onPress={() => onRemove(i)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Убрать ${it.name}`}
            hitSlop={10}
            style={styles.remove}
          >
            <Ionicons name="close" size={16} color="#fff" />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: { gap: 10, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 },
    item: { paddingTop: 6, paddingRight: 6 },
    thumbWrap: { width: 76, height: 76, borderRadius: 12, overflow: 'hidden' },
    thumb: { width: 76, height: 76 },
    videoBadge: {
      position: 'absolute',
      left: 4,
      bottom: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 8,
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    videoText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    fileChip: {
      height: 76,
      maxWidth: 200,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: colors.surface,
    },
    fileName: { fontSize: 14, fontWeight: '700', color: colors.text },
    fileSize: { fontSize: 13, color: colors.textSecondary },
    remove: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: '#111',
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
