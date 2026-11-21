import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, type ThemeColors } from '../../theme';

export type ActionSheetItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  danger?: boolean;
};

type Props = {
  visible: boolean;
  title?: string;
  items: ActionSheetItem[];
  onClose: () => void;
};

/** Нижнее меню действий: закрывается по нажатию на фон и после выбора пункта. */
export function ActionSheet({ visible, title, items, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="Закрыть меню">
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.grabber} />
          {title ? (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {items.map((it) => (
            <Pressable
              key={it.key}
              onPress={() => {
                onClose();
                it.onPress();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.primary + '12' }]}
            >
              <Ionicons name={it.icon} size={24} color={it.danger ? '#DC2626' : colors.text} />
              <Text style={[styles.itemText, it.danger && { color: '#DC2626' }]}>{it.label}</Text>
            </Pressable>
          ))}
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
    },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.textMuted + '88',
      marginBottom: 8,
    },
    title: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textSecondary,
      paddingHorizontal: 20,
      paddingVertical: 8,
    },
    item: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20 },
    itemText: { fontSize: 17, fontWeight: '600', color: colors.text },
  });
}
