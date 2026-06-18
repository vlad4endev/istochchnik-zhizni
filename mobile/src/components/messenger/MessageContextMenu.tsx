import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useMemo } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { MessageWithSender } from '../../api/messenger';
import { androidRipple, messengerTextProps } from '../../theme/messenger';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🙏', '🔥', '😮'] as const;

interface MessageContextMenuProps {
  visible: boolean;
  message: MessageWithSender | null;
  isOwn: boolean;
  onClose: () => void;
  onReply: (message: MessageWithSender) => void;
  onReact: (messageId: string, emoji: string) => void;
  onDelete: (messageId: string) => void;
}

export function MessageContextMenu({
  visible,
  message,
  isOwn,
  onClose,
  onReply,
  onReact,
  onDelete,
}: MessageContextMenuProps) {
  const styles = useMemo(() => createStyles(), []);

  if (!message) return null;

  const messageId = message.id;
  const canCopy = message.payload_type === 'text' && String(message.content ?? '').trim().length > 0;

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(String(message.content ?? ''));
      Alert.alert('Скопировано', 'Текст скопирован в буфер обмена');
    } catch {
      Alert.alert('Ошибка', 'Не удалось скопировать');
    }
    onClose();
  };

  const handlePin = () => {
    Alert.alert('Скоро', 'Закрепление сообщений появится в следующем обновлении');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.menu} onPress={(e) => e.stopPropagation()}>
          <View style={styles.quickReactions}>
            {QUICK_REACTIONS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => {
                  onReact(messageId, emoji);
                  onClose();
                }}
                android_ripple={androidRipple}
                style={({ pressed }) => [
                  styles.quickReactionBtn,
                  pressed ? { transform: [{ scale: 1.3 }] } : null,
                ]}
              >
                <Text style={styles.quickReactionEmoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.menuDivider} />

          <MenuItem
            styles={styles}
            emoji="↩️"
            label="Ответить"
            onPress={() => {
              onReply(message);
              onClose();
            }}
          />
          {canCopy ? (
            <MenuItem styles={styles} emoji="📋" label="Копировать" onPress={() => void handleCopy()} />
          ) : null}
          <MenuItem styles={styles} emoji="📌" label="Закрепить" onPress={handlePin} />
          <MenuItem
            styles={styles}
            emoji="😀"
            label="Реакция"
            onPress={() => {
              onReact(messageId, '👍');
              onClose();
            }}
          />

          {isOwn ? (
            <>
              <View style={styles.menuDivider} />
              <Pressable
                onPress={() => {
                  onDelete(messageId);
                  onClose();
                }}
                android_ripple={androidRipple}
                style={styles.menuItem}
              >
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
                <Text {...messengerTextProps} style={styles.menuItemDangerText}>
                  Удалить
                </Text>
              </Pressable>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MenuItem({
  styles,
  emoji,
  label,
  onPress,
}: {
  styles: ReturnType<typeof createStyles>;
  emoji: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} android_ripple={androidRipple} style={styles.menuItem}>
      <Text style={styles.menuItemEmoji}>{emoji}</Text>
      <Text {...messengerTextProps} style={styles.menuItemText}>
        {label}
      </Text>
    </Pressable>
  );
}

function createStyles() {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    menu: {
      width: '100%',
      maxWidth: 320,
      backgroundColor: '#fff',
      borderRadius: 16,
      overflow: 'hidden',
    },
    quickReactions: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    quickReactionBtn: {
      padding: 4,
    },
    quickReactionEmoji: {
      fontSize: 22,
    },
    menuDivider: {
      height: 0.5,
      backgroundColor: 'rgba(0,0,0,0.08)',
      marginHorizontal: 12,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    menuItemEmoji: {
      fontSize: 18,
      width: 24,
      textAlign: 'center',
    },
    menuItemText: {
      fontSize: 16,
      color: '#111',
    },
    menuItemDangerText: {
      fontSize: 16,
      color: '#ef4444',
      fontWeight: '600',
    },
  });
}
