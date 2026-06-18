import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';

import type { MessageWithSender } from '../../api/messenger';
import { normalizeChatDisplayText } from '../../lib/messengerUtils';
import { androidRipple, MESSENGER_BRAND, messengerTextProps } from '../../theme/messenger';

interface ReplyBarProps {
  replyTo: MessageWithSender | null;
  onCancel: () => void;
}

export function ReplyBar({ replyTo, onCancel }: ReplyBarProps) {
  const styles = useMemo(() => createStyles(), []);

  if (!replyTo) return null;

  const from =
    replyTo.sender_name ||
    replyTo.sender_first_name ||
    'Сообщение';
  const text = replyTo.is_deleted
    ? 'Сообщение удалено'
    : normalizeChatDisplayText(replyTo.content);

  return (
    <Animated.View
      entering={SlideInDown.duration(150)}
      exiting={SlideOutDown.duration(120)}
      style={styles.replyBar}
    >
      <View style={styles.replyBarAccent} />
      <View style={styles.replyBarBody}>
        <Text {...messengerTextProps} style={styles.replyBarName}>
          {from}
        </Text>
        <Text {...messengerTextProps} numberOfLines={1} style={styles.replyBarText}>
          {text}
        </Text>
      </View>
      <Pressable
        onPress={onCancel}
        hitSlop={12}
        android_ripple={androidRipple}
        style={styles.replyBarClose}
      >
        <Ionicons name="close" size={14} color="#888" />
      </Pressable>
    </Animated.View>
  );
}

function createStyles() {
  return StyleSheet.create({
    replyBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderTopWidth: 0.5,
      borderTopColor: 'rgba(0,0,0,0.08)',
      backgroundColor: '#fff',
      gap: 10,
    },
    replyBarAccent: {
      width: 3,
      alignSelf: 'stretch',
      backgroundColor: MESSENGER_BRAND,
      borderRadius: 2,
    },
    replyBarBody: {
      flex: 1,
      minWidth: 0,
    },
    replyBarName: {
      fontSize: 12,
      fontWeight: '600',
      color: MESSENGER_BRAND,
      marginBottom: 2,
    },
    replyBarText: {
      fontSize: 12,
      color: '#666',
    },
    replyBarClose: {
      padding: 4,
    },
  });
}
