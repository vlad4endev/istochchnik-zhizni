import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../theme';

type Props = {
  text: string;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

/** Срочная молитвенная нужда — заметный блок над планом дня; координатор может изменить или снять. */
export function UrgentPrayerCard({ text, canManage, onEdit, onDelete }: Props) {
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(isDark), [isDark]);

  return (
    <View style={{ gap: 8 }}>
      {canManage ? (
        <View style={styles.actions}>
          <Pressable
            onPress={onEdit}
            accessibilityRole="button"
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.btnText}>Изменить</Text>
          </Pressable>
          <Pressable
            onPress={onDelete}
            accessibilityRole="button"
            style={({ pressed }) => [styles.btn, styles.btnDanger, pressed && { opacity: 0.7 }]}
          >
            <Text style={[styles.btnText, styles.btnDangerText]}>Удалить</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.card} accessibilityLabel="Срочная молитвенная нужда">
        <View style={styles.icon}>
          <Ionicons name="flame" size={24} color={isDark ? '#FDA4AF' : '#BE123C'} />
        </View>
        <View style={styles.body}>
          <Text style={styles.label}>Срочная молитвенная нужда</Text>
          <Text style={styles.text}>{text}</Text>
        </View>
      </View>
    </View>
  );
}

function createStyles(isDark: boolean) {
  const ink = isDark ? '#FFE4E6' : '#4C0519';
  const accent = isDark ? '#FDA4AF' : '#9F1239';
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      gap: 12,
      padding: 16,
      borderRadius: 18,
      borderWidth: 2,
      borderColor: isDark ? '#9F1239' : '#FDA4AF',
      backgroundColor: isDark ? '#3B1220' : '#FFF1F2',
    },
    icon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: isDark ? '#9F123933' : '#F43F5E26',
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: { flex: 1, minWidth: 0 },
    label: {
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: accent,
    },
    text: { marginTop: 8, fontSize: 18, fontWeight: '600', lineHeight: 27, color: ink },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    btn: {
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? '#9F1239' : '#FDA4AF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnText: { fontSize: 15, fontWeight: '800', color: accent },
    btnDanger: { borderColor: isDark ? '#B91C1C' : '#FCA5A5' },
    btnDangerText: { color: isDark ? '#FCA5A5' : '#B91C1C' },
  });
}
