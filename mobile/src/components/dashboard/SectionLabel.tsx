import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useTheme } from '../../theme';

export function SectionLabel({ children }: { children: string }) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        label: {
          fontSize: 12,
          fontWeight: '700',
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: colors.primary,
          paddingHorizontal: 4,
          marginTop: 8,
        },
      }),
    [colors],
  );
  return (
    <Text style={styles.label} accessibilityRole="header">
      {children}
    </Text>
  );
}
