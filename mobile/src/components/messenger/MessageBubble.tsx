import { Image } from 'expo-image';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MessageWithSender } from '../../api/messenger';
import { resolveApiOrigin } from '../../lib/config';
import { getAuthToken } from '../../lib/storage';
import {
  formatMessageTime,
  messagePreviewText,
  normalizeChatDisplayText,
} from '../../lib/messengerUtils';
import { androidRipple, messengerTextProps } from '../../theme/messenger';
import { useTheme } from '../../theme';

interface MessageBubbleProps {
  message: MessageWithSender;
  isOwn: boolean;
  showSenderName: boolean;
  onLongPress?: (message: MessageWithSender) => void;
}

export function MessageBubble({
  message,
  isOwn,
  showSenderName,
  onLongPress,
}: MessageBubbleProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, isOwn), [colors, isOwn]);

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

  return (
    <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}>
      {onLongPress ? (
        <Pressable
          onLongPress={() => onLongPress(message)}
          android_ripple={androidRipple}
          style={({ pressed }) => [pressed ? { opacity: 0.92 } : null]}
        >
          {bubble}
        </Pressable>
      ) : (
        bubble
      )}
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
    bubble: {
      maxWidth: '82%',
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 4,
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
