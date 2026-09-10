import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
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
} from '../../lib/messengerUtils';
import { MESSENGER_BRAND } from '../../theme/messenger';
import { MessengerText, MessengerTimeText } from './MessengerText';
import { useTheme } from '../../theme';

const SWIPE_REPLY_THRESHOLD = 52;
const LONG_PRESS_MS = 520;

interface MessageBubbleProps {
  message: MessageWithSender;
  isOwn: boolean;
  showSenderName: boolean;
  onLongPress?: (message: MessageWithSender) => void;
  onSwipeReply?: (message: MessageWithSender) => void;
  onVotePoll?: (messageId: string, optionIndexes: number[]) => Promise<void> | void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
}

export function MessageBubble({
  message,
  isOwn,
  showSenderName,
  onLongPress,
  onSwipeReply,
  onVotePoll,
  onToggleReaction,
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
  const showPoll = payloadType === 'poll' && !message.is_deleted;

  const imageUri = useMemo(() => {
    if (!showImage) return null;
    const payloadUrl = typeof message.payload?.url === 'string' ? message.payload.url : '';
    if (
      payloadUrl &&
      (payloadUrl.startsWith('file:') ||
        payloadUrl.startsWith('content:') ||
        payloadUrl.startsWith('ph:') ||
        payloadUrl.startsWith('assets-library:'))
    ) {
      return { uri: payloadUrl };
    }
    // Optimistic local preview before server id exists
    if (message.status === 'sending' && payloadUrl.startsWith('http')) {
      return { uri: payloadUrl };
    }
    if (message.status === 'sending' && !/^\d+$/.test(String(message.id)) && payloadUrl) {
      return { uri: payloadUrl };
    }
    const token = getAuthToken();
    const path = `/api/messenger/messages/${encodeURIComponent(message.id)}/attachment-file`;
    return {
      uri: `${resolveApiOrigin()}${path}`,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    };
  }, [message.id, message.payload?.url, message.status, showImage]);

  const bodyText = message.is_deleted
    ? 'Сообщение удалено'
    : showPoll
      ? ''
      : payloadType === 'text'
        ? String(message.content ?? '')
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

  const reactions = message.reactions ?? [];

  const forwardedFromLabel = useMemo(() => {
    const raw = message.forwarded_from;
    if (raw == null) return null;
    let obj: unknown = raw;
    if (typeof raw === 'string') {
      try {
        obj = JSON.parse(raw);
      } catch {
        return null;
      }
    }
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;
    const name = String((obj as { sender_name?: unknown }).sender_name ?? '').trim();
    return name || 'сообщения';
  }, [message.forwarded_from]);

  const bubble = (
    <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
      {showSenderName && !isOwn ? (
        <MessengerText numberOfLines={1} style={styles.senderName}>
          {message.sender_name || message.sender_first_name || 'Участник'}
        </MessengerText>
      ) : null}

      {forwardedFromLabel && !message.is_deleted ? (
        <View style={styles.forwardRow}>
          <Ionicons
            name="arrow-redo"
            size={12}
            color={isOwn ? 'rgba(255,255,255,0.85)' : colors.primary}
          />
          <MessengerText numberOfLines={1} style={styles.forwardLabel}>
            Переслано от {forwardedFromLabel}
          </MessengerText>
        </View>
      ) : null}

      {message.is_pinned && !message.is_deleted ? (
        <View style={styles.pinRow}>
          <Ionicons
            name="pin"
            size={12}
            color={isOwn ? 'rgba(255,255,255,0.85)' : colors.primary}
          />
          <MessengerText bidiSafe={false} style={styles.pinLabel}>
            Закреплено
          </MessengerText>
        </View>
      ) : null}

      {message.reply_preview && !message.is_deleted ? (
        <View style={styles.reply}>
          <MessengerText style={styles.replyAuthor} numberOfLines={1}>
            {message.reply_preview.sender_name || 'Ответ'}
          </MessengerText>
          <MessengerText style={styles.replyText} numberOfLines={2}>
            {message.reply_preview.is_deleted
              ? 'Сообщение удалено'
              : String(message.reply_preview.content ?? '')}
          </MessengerText>
        </View>
      ) : null}

      {showImage && imageUri ? (
        <Image source={imageUri} style={styles.image} contentFit="cover" />
      ) : null}

      {showPoll ? (
        <PollInsideBubble
          message={message}
          isOwn={isOwn}
          styles={styles}
          onVotePoll={onVotePoll}
        />
      ) : bodyText ? (
        <MessengerText style={[styles.text, message.is_deleted && styles.deletedText]}>
          {bodyText}
        </MessengerText>
      ) : null}

      {reactions.length > 0 && !message.is_deleted ? (
        <View style={styles.reactionRow}>
          {reactions.map((r) => (
            <Pressable
              key={r.emoji}
              onPress={() => onToggleReaction?.(message.id, r.emoji)}
              style={[
                styles.reactionChip,
                r.reacted_by_me ? styles.reactionChipMine : null,
              ]}
            >
              <MessengerText bidiSafe={false} style={styles.reactionEmoji}>
                {r.emoji}
              </MessengerText>
              {r.count > 1 ? (
                <MessengerText bidiSafe={false} style={styles.reactionCount}>
                  {r.count}
                </MessengerText>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.meta}>
        {message.is_edited && !message.is_deleted ? (
          <MessengerText bidiSafe={false} style={styles.metaText}>
            изм.
          </MessengerText>
        ) : null}
        <MessengerTimeText style={styles.metaText}>
          {formatMessageTime(message.created_at)}
        </MessengerTimeText>
        {isPending ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
        {isError ? (
          <MessengerText bidiSafe={false} style={styles.errorText}>
            !
          </MessengerText>
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

function PollInsideBubble({
  message,
  isOwn,
  styles,
  onVotePoll,
}: {
  message: MessageWithSender;
  isOwn: boolean;
  styles: ReturnType<typeof createStyles>;
  onVotePoll?: (messageId: string, optionIndexes: number[]) => Promise<void> | void;
}) {
  const payload = (message.payload ?? {}) as Record<string, unknown>;
  const options = Array.isArray(payload.options)
    ? payload.options.map((x) => String(x ?? ''))
    : [];
  const allowsMultiple = Boolean(payload.allows_multiple);
  const tallies =
    message.poll_tallies?.length === options.length
      ? message.poll_tallies
      : options.map(() => 0);
  const myVotes = message.poll_my_options ?? [];
  const mySet = useMemo(() => new Set(myVotes), [myVotes]);
  const total = tallies.reduce((a, b) => a + b, 0);
  const hasMyVote = mySet.size > 0;
  const isOptimistic = message.status === 'sending' || String(message.id).startsWith('temp-');
  const [multiPick, setMultiPick] = useState<Set<number>>(() => new Set());
  const [multiEdit, setMultiEdit] = useState(false);
  const [voting, setVoting] = useState(false);

  const showMultiPicker = !isOptimistic && allowsMultiple && (!hasMyVote || multiEdit);
  const showSinglePicker = !isOptimistic && !allowsMultiple && !hasMyVote;
  const showResults = !isOptimistic && !showSinglePicker && !showMultiPicker;

  const runVote = async (indexes: number[]) => {
    if (!onVotePoll || voting || isOptimistic) return;
    setVoting(true);
    try {
      await onVotePoll(message.id, indexes);
      setMultiEdit(false);
    } finally {
      setVoting(false);
    }
  };

  if (!options.length) {
    return (
      <MessengerText style={styles.text}>Опрос недоступен</MessengerText>
    );
  }

  return (
    <View style={styles.pollWrap}>
      <MessengerText style={styles.pollQuestion}>{message.content || 'Опрос'}</MessengerText>
      {options.map((label, i) => {
        const count = tallies[i] ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const picked = mySet.has(i);
        const optionLabel = label || `Вариант ${i + 1}`;

        if (isOptimistic || showSinglePicker || showMultiPicker) {
          const checked = showMultiPicker ? multiPick.has(i) : false;
          return (
            <Pressable
              key={i}
              disabled={isOptimistic || voting}
              onPress={() => {
                if (isOptimistic) return;
                if (showMultiPicker) {
                  setMultiPick((prev) => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    return next;
                  });
                } else {
                  void runVote([i]);
                }
              }}
              style={styles.pollOption}
            >
              <View
                style={[
                  allowsMultiple ? styles.pollCheck : styles.pollRadio,
                  (showMultiPicker ? checked : false) && styles.pollCheckOn,
                ]}
              >
                {(showMultiPicker ? checked : false) ? (
                  <Ionicons
                    name="checkmark"
                    size={12}
                    color={isOwn ? MESSENGER_BRAND : '#fff'}
                  />
                ) : null}
              </View>
              <MessengerText style={styles.pollOptionText}>{optionLabel}</MessengerText>
            </Pressable>
          );
        }

        return (
          <View key={i} style={styles.pollResultRow}>
            <View
              style={[
                styles.pollBar,
                { width: `${pct}%` as `${number}%` },
                picked ? styles.pollBarPicked : null,
              ]}
            />
            <View style={styles.pollResultContent}>
              <MessengerText style={styles.pollOptionText} numberOfLines={2}>
                {optionLabel}
              </MessengerText>
              <MessengerText bidiSafe={false} style={styles.pollPct}>
                {pct}%
              </MessengerText>
            </View>
          </View>
        );
      })}

      {showMultiPicker ? (
        <Pressable
          disabled={voting || multiPick.size === 0}
          onPress={() => void runVote([...multiPick].sort((a, b) => a - b))}
          style={[styles.pollSubmit, multiPick.size === 0 && { opacity: 0.45 }]}
        >
          <MessengerText bidiSafe={false} style={styles.pollSubmitText}>
            {voting ? '…' : 'Голосовать'}
          </MessengerText>
        </Pressable>
      ) : null}

      {showResults && allowsMultiple ? (
        <Pressable
          onPress={() => {
            setMultiPick(new Set(myVotes));
            setMultiEdit(true);
          }}
          style={styles.pollRevote}
        >
          <MessengerText bidiSafe={false} style={styles.pollRevoteText}>
            Изменить голос
          </MessengerText>
        </Pressable>
      ) : null}

      {showResults ? (
        <MessengerText bidiSafe={false} style={styles.pollTotal}>
          {total} {pluralVotes(total)}
        </MessengerText>
      ) : null}
    </View>
  );
}

function pluralVotes(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'голосов';
  if (mod10 === 1) return 'голос';
  if (mod10 >= 2 && mod10 <= 4) return 'голоса';
  return 'голосов';
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
      minWidth: 160,
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
    forwardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 2,
    },
    forwardLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: isOwn ? 'rgba(255,255,255,0.85)' : colors.primary,
      flexShrink: 1,
    },
    pinRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 2,
    },
    pinLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: isOwn ? 'rgba(255,255,255,0.85)' : colors.primary,
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
    reactionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      marginTop: 4,
    },
    reactionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 10,
      backgroundColor: isOwn ? 'rgba(255,255,255,0.18)' : 'rgba(28,25,23,0.06)',
    },
    reactionChipMine: {
      borderWidth: 1,
      borderColor: isOwn ? 'rgba(255,255,255,0.55)' : colors.primary,
    },
    reactionEmoji: {
      fontSize: 13,
    },
    reactionCount: {
      fontSize: 11,
      fontWeight: '700',
      color: isOwn ? colors.textOnPrimary : colors.textSecondary,
    },
    pollWrap: {
      gap: 6,
      minWidth: 200,
    },
    pollQuestion: {
      fontSize: 15,
      fontWeight: '700',
      lineHeight: 20,
      color: isOwn ? colors.textOnPrimary : colors.text,
      marginBottom: 2,
    },
    pollOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    pollRadio: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: isOwn ? 'rgba(255,255,255,0.55)' : 'rgba(28,25,23,0.25)',
    },
    pollCheck: {
      width: 18,
      height: 18,
      borderRadius: 5,
      borderWidth: 2,
      borderColor: isOwn ? 'rgba(255,255,255,0.55)' : 'rgba(28,25,23,0.25)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    pollCheckOn: {
      backgroundColor: isOwn ? '#fff' : colors.primary,
      borderColor: isOwn ? '#fff' : colors.primary,
    },
    pollOptionText: {
      flex: 1,
      fontSize: 14,
      lineHeight: 18,
      color: isOwn ? colors.textOnPrimary : colors.text,
    },
    pollResultRow: {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 8,
      marginBottom: 2,
      minHeight: 36,
      justifyContent: 'center',
    },
    pollBar: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      backgroundColor: isOwn ? 'rgba(255,255,255,0.22)' : 'rgba(139,26,26,0.12)',
      borderRadius: 8,
    },
    pollBarPicked: {
      backgroundColor: isOwn ? 'rgba(255,255,255,0.36)' : 'rgba(139,26,26,0.22)',
    },
    pollResultContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 8,
      paddingVertical: 8,
      zIndex: 1,
    },
    pollPct: {
      fontSize: 12,
      fontWeight: '700',
      color: isOwn ? colors.textOnPrimary : colors.primary,
    },
    pollSubmit: {
      marginTop: 4,
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: isOwn ? 'rgba(255,255,255,0.22)' : colors.primary,
    },
    pollSubmitText: {
      fontSize: 13,
      fontWeight: '700',
      color: isOwn ? colors.textOnPrimary : colors.textOnPrimary,
    },
    pollRevote: {
      paddingVertical: 4,
    },
    pollRevoteText: {
      fontSize: 12,
      fontWeight: '600',
      color: isOwn ? 'rgba(255,255,255,0.8)' : colors.primary,
    },
    pollTotal: {
      fontSize: 11,
      color: isOwn ? 'rgba(255,255,255,0.7)' : colors.textMuted,
      marginTop: 2,
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
