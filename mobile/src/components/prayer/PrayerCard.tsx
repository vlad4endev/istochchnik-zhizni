import { Ionicons } from '@expo/vector-icons';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme, type ThemeColors } from '../../theme';

type PrayerIcon = keyof typeof Ionicons.glyphMap;

interface PrayerCardProps {
  icon: PrayerIcon;
  title: string;
  accentColor: string;
  children: ReactNode;
  label?: string;
}

export function PrayerCard({ icon, title, accentColor, children, label }: PrayerCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, accentColor), [colors, accentColor]);

  return (
    <View style={styles.card}>
      <View style={styles.accentBar} />
      <View style={styles.inner}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Ionicons name={icon} size={22} color={accentColor} />
          </View>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.body}>{children}</View>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors, accentColor: string) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      marginBottom: 16,
      overflow: 'hidden',
      shadowColor: '#1c1917',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.06,
      shadowRadius: 16,
      elevation: 3,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.06)',
    },
    accentBar: {
      width: 4,
      backgroundColor: accentColor,
    },
    inner: {
      flex: 1,
      paddingHorizontal: 18,
      paddingVertical: 18,
    },
    label: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.66,
      textTransform: 'uppercase',
      color: colors.textMuted,
      marginBottom: 10,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 14,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(28,25,23,0.06)',
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${accentColor}1A`,
    },
    title: {
      flex: 1,
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
      lineHeight: 24,
      paddingTop: 2,
    },
    body: {
      gap: 10,
    },
  });
}

export function PrayerBodyText({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text style={{ fontSize: 15, lineHeight: 22, color: colors.textSecondary }}>
      {children}
    </Text>
  );
}

export function PrayerMutedText({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text style={{ fontSize: 15, lineHeight: 22, color: colors.textMuted, fontStyle: 'italic' }}>
      {children}
    </Text>
  );
}

export function PrayerHighlightBox({
  icon,
  accentColor,
  children,
}: {
  icon: PrayerIcon;
  accentColor: string;
  children: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 10,
        backgroundColor: `${accentColor}12`,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: `${accentColor}2E`,
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <Ionicons name={icon} size={18} color={accentColor} style={{ marginTop: 2 }} />
      <Text
        style={{
          flex: 1,
          fontSize: 15,
          lineHeight: 22,
          color: colors.textSecondary,
          fontStyle: 'italic',
        }}
      >
        {children}
      </Text>
    </View>
  );
}
