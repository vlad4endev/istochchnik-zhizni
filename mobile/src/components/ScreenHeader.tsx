import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useTheme, type ThemeColors } from '../theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

export function ScreenHeader({ title, subtitle, right }: ScreenHeaderProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.header}>
      <View style={styles.row}>
        <View style={styles.textCol}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    header: {
      backgroundColor: colors.primary,
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 20,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    textCol: { flex: 1 },
    right: { paddingTop: 4 },
    title: {
      color: colors.textOnPrimary,
      fontSize: 26,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    subtitle: {
      color: colors.textOnPrimary,
      opacity: 0.85,
      fontSize: 14,
      marginTop: 4,
      fontWeight: '500',
    },
  });
}

export function useCardStyle(): ViewStyle {
  const { colors } = useTheme();
  return useMemo(
    () => ({
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      paddingHorizontal: 20,
      paddingVertical: 18,
      shadowColor: '#1c1917',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.06,
      shadowRadius: 16,
      elevation: 2,
    }),
    [colors],
  );
}
