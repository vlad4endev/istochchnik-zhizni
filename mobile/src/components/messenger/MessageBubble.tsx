import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { MessageWithSender } from '../../api/messenger';
import { resolveApiOrigin } from '../../lib/config';
import { getAuthToken } from '../../lib/storage';
import {
  formatMessageTime,
  messagePreviewText,
  normalizeChatDisplayText,
} from '../../lib/messengerUtils';
import { MESSENGER_BRAND, messengerTextProps } from '../../theme/messenger';
import { useTheme } from '../../theme';

const SWIPE_REPLY_THRESHOLD = 52;
const LONG_PRESS_MS = 520;

interface MessageBubbleProps {
  message: MessageWithSender;
  isOwn: boolean;
  showSenderName: boolean;
  onLongPress?: (message: MessageWithSender) => void;
  onSwipeReply?: (message: MessageWithSender) => void;
}

export function MessageBubble({
  message,
  isOwn,
  showSenderName,
  onLongPress,
  onSwipeReply,
}: MessageBubbleProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, isOwn), [colors, isOwn]);
  const translateX = useSharedValue(0);
  const replyOpacity = useSharedValue(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didSwipe = useRef(false);

  const isPending = message.status === 'sending';
  const isError = message.status === 'error';
  const payloadType = message.payload_type ?? 'text';
  const showImage = payloadType === 'image' && !message.is_deleted;

  const imageUri = useMemo(() => {
    if (!showImage) return null;
    const token = getAuthToken();
    const path = `/api/messenger/messages/${encodeURIComponent(message.id)}/attachment-file`;
    return {
      uri: `${resolveApiOrigin()}${path}`,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    };
  }, [message.id, showImage]);

  const bodyText = message.is_deleted
    ? 'Сообщение удалено'
    : payloadType === 'text'
      ? normalizeChatDisplayText(message.content)
      : messagePreviewText(message);

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.8,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          didSwipe.current = false;
          if (!onLongPress) return;
          longPressTimer.current = setTimeout(() => {
            if (!didSwipe.current) {
              onLongPress(message);
            }
          }, LONG_PRESS_MS);
        },
        onPanResponderMove: (_, gesture) => {
          if (Math.abs(gesture.dx) > 12) {
            didSwipe.current = true;
            clearLongPressTimer();
          }

          let dx = gesture.dx;
          if (isOwn) {
            dx = Math.min(0, dx);
            dx = Math.max(dx, -72);
          } else {
            dx = Math.max(0, dx);
            dx = Math.min(dx, 72);
          }

          translateX.value = dx;
          replyOpacity.value = Math.min(1, Math.abs(dx) / SWIPE_REPLY_THRESHOLD);
        },
        onPanResponderRelease: (_, gesture) => {
          clearLongPressTimer();
          const triggered = isOwn
            ? gesture.dx < -SWIPE_REPLY_THRESHOLD
            : gesture.dx > SWIPE_REPLY_THRESHOLD;
          if (triggered && onSwipeReply) {
            onSwipeReply(message);
            if (Platform.OS !== 'web') {
              Vibration.vibrate(45);
            }
          }
          translateX.value = withSpring(0, { stiffness: 420, damping: 32 });
          replyOpacity.value = withSpring(0);
        },
        onPanResponderTerminate: () => {
          clearLongPressTimer();
          translateX.value = withSpring(0, { stiffness: 420, damping: 32 });
          replyOpacity.value = withSpring(0);
        },
      }),
    [isOwn, message, onLongPress, onSwipeReply, replyOpacity, translateX],
  );

  const bubbleAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const replyIconAnimatedStyle = useAnimatedStyle(() => ({
    opacity: replyOpacity.value,
    transform: [{ scale: 0.85 + replyOpacity.value * 0.15 }],
  }));

  const bubble = (
    <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
      {showSenderName && !isOwn ? (
        <Text {...messengerTextProps} style={styles.senderName}>
          {message.sender_name || message.sender_first_name || 'Участник'}
        </Text>
      ) : null}

      {message.reply_preview && !message.is_deleted ? (
        <View style={styles.reply}>
          <Text {...messengerTextProps} style={styles.replyAuthor} numberOfLines={1}>
            {message.reply_preview.sender_name || 'Ответ'}
          </Text>
          <Text {...messengerTextProps} style={styles.replyText} numberOfLines={2}>
            {message.reply_preview.is_deleted
              ? 'Сообщение удалено'
              : normalizeChatDisplayText(message.reply_preview.content)}
          </Text>
        </View>
      ) : null}

      {showImage && imageUri ? (
        <Image source={imageUri} style={styles.image} contentFit="cover" />
      ) : null}

      <Text {...messengerTextProps} style={[styles.text, message.is_deleted && styles.deletedText]}>
        {bodyText}
      </Text>

      <View style={styles.meta}>
        {message.is_edited && !message.is_deleted ? (
          <Text {...messengerTextProps} style={styles.metaText}>
            изм.
          </Text>
        ) : null}
        <Text {...messengerTextProps} style={styles.metaText}>
          {formatMessageTime(message.created_at)}
        </Text>
        {isPending ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
        {isError ? (
          <Text {...messengerTextProps} style={styles.errorText}>
            !
          </Text>
        ) : null}
      </View>
    </View>
  );

  const interactive = onLongPress || onSwipeReply;

  return (
    <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}>
      <View style={styles.swipeWrap}>
        <Animated.View
          style={[
            styles.replyIcon,
            isOwn ? styles.replyIconOwn : styles.replyIconOther,
            replyIconAnimatedStyle,
          ]}
          pointerEvents="none"
        >
          <View style={styles.replyIconCircle}>
            <Ionicons name="arrow-undo" size={18} color={MESSENGER_BRAND} />
          </View>
        </Animated.View>

        {interactive ? (
          <Animated.View style={bubbleAnimatedStyle} {...panResponder.panHandlers}>
            {bubble}
          </Animated.View>
        ) : (
          bubble
        )}
      </View>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isOwn: boolean) {
  return StyleSheet.create({
    row: {
      paddingHorizontal: 12,
      paddingVertical: 3,
      flexDirection: 'row',
    },
    rowOwn: {
      justifyContent: 'flex-end',
    },
    rowOther: {
      justifyContent: 'flex-start',
    },
    swipeWrap: {
      position: 'relative',
      maxWidth: '88%',
    },
    replyIcon: {
      position: 'absolute',
      top: '50%',
      marginTop: -18,
      zIndex: 0,
    },
    replyIconOwn: {
      right: 8,
    },
    replyIconOther: {
      left: 8,
    },
    replyIconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(139,26,26,0.1)',
      borderWidth: 1,
      borderColor: 'rgba(139,26,26,0.2)',
    },
    bubble: {
      maxWidth: '100%',
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 4,
      zIndex: 1,
    },
    bubbleOwn: {
      backgroundColor: colors.primary,
      borderBottomRightRadius: 4,
    },
    bubbleOther: {
      backgroundColor: colors.surfaceElevated,
      borderBottomLeftRadius: 4,
      shadowColor: '#1c1917',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 1,
    },
    senderName: {
      fontSize: 12,
      fontWeight: '700',
      color: isOwn ? colors.textOnPrimary : colors.primary,
      opacity: isOwn ? 0.9 : 1,
    },
    reply: {
      borderLeftWidth: 3,
      borderLeftColor: isOwn ? 'rgba(255,255,255,0.5)' : colors.primary,
      paddingLeft: 8,
      marginBottom: 4,
      opacity: 0.9,
    },
    replyAuthor: {
      fontSize: 11,
      fontWeight: '700',
      color: isOwn ? colors.textOnPrimary : colors.primary,
    },
    replyText: {
      fontSize: 12,
      color: isOwn ? colors.textOnPrimary : colors.textSecondary,
      opacity: 0.85,
    },
    image: {
      width: 220,
      height: 160,
      borderRadius: 12,
      marginBottom: 4,
    },
    text: {
      fontSize: 16,
      lineHeight: 22,
      color: isOwn ? colors.textOnPrimary : colors.text,
    },
    deletedText: {
      fontStyle: 'italic',
      opacity: 0.7,
    },
    meta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 6,
      marginTop: 2,
    },
    metaText: {
      fontSize: 11,
      color: isOwn ? 'rgba(255,255,255,0.75)' : colors.textMuted,
    },
    errorText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#ef4444',
    },
  });
}
