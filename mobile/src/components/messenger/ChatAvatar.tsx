import { Image } from 'expo-image';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getAvatarColor, getAvatarInitial } from '../../lib/messengerUtils';
import { useTheme } from '../../theme';

interface ChatAvatarProps {
  name: string;
  imageUrl?: string | null;
  seed?: string;
  size?: number;
  showOnline?: boolean;
  isOnline?: boolean;
}

export function ChatAvatar({
  name,
  imageUrl,
  seed,
  size = 48,
  showOnline = false,
  isOnline = false,
}: ChatAvatarProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(size), [size]);
  const letter = getAvatarInitial(name);
  const bg = getAvatarColor(seed ?? name);

  return (
    <View style={styles.wrap}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.image} contentFit="cover" />
      ) : (
        <View style={[styles.fallback, { backgroundColor: bg }]}>
          <Text style={[styles.letter, { color: colors.textOnPrimary }]}>{letter}</Text>
        </View>
      )}
      {showOnline ? (
        <View
          style={[
            styles.online,
            { backgroundColor: isOnline ? '#22c55e' : colors.textMuted },
          ]}
        />
      ) : null}
    </View>
  );
}

function createStyles(size: number) {
  return StyleSheet.create({
    wrap: {
      width: size,
      height: size,
      position: 'relative',
    },
    image: {
      width: size,
      height: size,
      borderRadius: size / 2,
    },
    fallback: {
      width: size,
      height: size,
      borderRadius: size / 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    letter: {
      fontSize: size * 0.42,
      fontWeight: '700',
    },
    online: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: size * 0.28,
      height: size * 0.28,
      borderRadius: size * 0.14,
      borderWidth: 2,
      borderColor: '#fff',
    },
  });
}
