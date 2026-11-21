import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ConversationListItem } from '../../api/messenger';
import { getConversationTitle } from '../../lib/messengerUtils';
import { useTheme, type ThemeColors } from '../../theme';

type Props = {
  conversation: ConversationListItem | null;
  onClose: () => void;
  onTogglePin: (c: ConversationListItem) => void;
  onToggleMute: (c: ConversationListItem) => void;
  onMarkRead: (c: ConversationListItem) => void;
  onGroupCall: (c: ConversationListItem) => void;
};

/** Меню чата по долгому нажатию, как в Telegram: закрепить, без звука, прочитано, созвон. */
export function ChatActionsSheet({
  conversation,
  onClose,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onGroupCall,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const c = conversation;

  const items: Array<{
    key: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
  }> = c
    ? [
        {
          key: 'pin',
          icon: c.my_ui_pinned ? 'pin' : 'pin-outline',
          label: c.my_ui_pinned ? 'Открепить' : 'Закрепить',
          onPress: () => onTogglePin(c),
        },
        {
          key: 'mute',
          icon: c.my_muted ? 'notifications-outline' : 'notifications-off-outline',
          label: c.my_muted ? 'Включить уведомления' : 'Выключить уведомления',
          onPress: () => onToggleMute(c),
        },
        ...(c.unread_count > 0 && c.last_message
          ? [
              {
                key: 'read',
                icon: 'checkmark-done-outline' as const,
                label: 'Отметить прочитанным',
                onPress: () => onMarkRead(c),
              },
            ]
          : []),
        ...(c.type !== 'private'
          ? [
              {
                key: 'call',
                icon: 'videocam-outline' as const,
                label: 'Групповой созвон',
                onPress: () => onGroupCall(c),
              },
            ]
          : []),
      ]
    : [];

  return (
    <Modal visible={c != null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="Закрыть меню">
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.grabber} />
          {c ? (
            <Text style={styles.title} numberOfLines={1}>
              {getConversationTitle(c)}
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
              <Ionicons name={it.icon} size={24} color={colors.text} />
              <Text style={styles.itemText}>{it.label}</Text>
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
    item: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      paddingHorizontal: 20,
    },
    itemText: { fontSize: 17, fontWeight: '600', color: colors.text },
  });
}
