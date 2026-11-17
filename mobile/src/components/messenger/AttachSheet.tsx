import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, type ThemeColors } from '../../theme';

export type AttachSource = 'camera' | 'gallery' | 'file';

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (source: AttachSource) => void;
};

const OPTIONS: Array<{
  id: AttachSource;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}> = [
  { id: 'camera', label: 'Камера', icon: 'camera', color: '#0F766E' },
  { id: 'gallery', label: 'Фото и видео', icon: 'images', color: '#2563EB' },
  { id: 'file', label: 'Файл', icon: 'document', color: '#EA580C' },
];

/** Что прикрепить: как в Telegram — камера, галерея, файл. */
export function AttachSheet({ visible, onClose, onPick }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="Закрыть">
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.grabber} />
          <View style={styles.row}>
            {OPTIONS.map((o) => (
              <Pressable
                key={o.id}
                onPress={() => {
                  onClose();
                  onPick(o.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={o.label}
                style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
              >
                <View style={[styles.circle, { backgroundColor: o.color }]}>
                  <Ionicons name={o.icon} size={28} color="#fff" />
                </View>
                <Text style={styles.label}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.surfaceElevated,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingTop: 8,
      paddingHorizontal: 16,
    },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.textMuted + '88',
      marginBottom: 16,
    },
    row: { flexDirection: 'row', justifyContent: 'space-around' },
    item: { alignItems: 'center', gap: 8, minWidth: 96, minHeight: 96 },
    circle: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: { fontSize: 15, fontWeight: '600', color: colors.text, textAlign: 'center' },
  });
}
