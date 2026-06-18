import { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ChatAvatar } from './ChatAvatar';
import type { TypingUser } from '../../stores/messengerRealtimeStore';
import { messengerTextProps } from '../../theme/messenger';

interface TypingIndicatorProps {
  typingUser: TypingUser | null;
  avatarName: string;
  avatarSeed?: string;
  avatarUrl?: string | null;
}

function TypingDot({ delay }: { delay: number }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 400 }),
        ),
        -1,
      ),
    );
  }, [delay, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

export function TypingIndicator({
  typingUser,
  avatarName,
  avatarSeed,
  avatarUrl,
}: TypingIndicatorProps) {
  if (!typingUser) return null;

  return (
    <View style={styles.typingRow}>
      <ChatAvatar name={avatarName} imageUrl={avatarUrl} seed={avatarSeed} size={24} />
      <View style={styles.typingBubble}>
        <TypingDot delay={0} />
        <TypingDot delay={300} />
        <TypingDot delay={600} />
      </View>
      <Text {...messengerTextProps} style={styles.typingLabel}>
        {typingUser.memberName} печатает...
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    transform: [{ scaleY: -1 }],
  },
  typingBubble: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#bbb',
  },
  typingLabel: {
    fontSize: 11,
    color: '#aaa',
  },
});
