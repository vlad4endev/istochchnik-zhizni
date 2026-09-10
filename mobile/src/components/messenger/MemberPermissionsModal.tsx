import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import {
  mergeDefaultChatPermissions,
  type ChatPermissionKey,
  type ConversationMember,
  type ConversationMeta,
} from '../../api/messenger';
import { useTheme, type ThemeColors } from '../../theme';

const ROWS: { key: ChatPermissionKey; label: string }[] = [
  { key: 'can_send_messages', label: 'Отправка сообщений' },
  { key: 'can_send_media', label: 'Медиа и файлы' },
  { key: 'can_add_users', label: 'Добавлять участников' },
  { key: 'can_pin_messages', label: 'Закреплять сообщения' },
  { key: 'can_manage_chat', label: 'Управление чатом' },
];

function initialPerms(
  member: ConversationMember,
  meta: ConversationMeta | null | undefined,
): Record<ChatPermissionKey, boolean> {
  const base = mergeDefaultChatPermissions(meta?.default_permissions);
  const next = { ...base };
  for (const key of Object.keys(base) as ChatPermissionKey[]) {
    if (member.permissions?.[key] !== undefined) {
      next[key] = Boolean(member.permissions[key]);
    }
  }
  return next;
}

interface MemberPermissionsModalProps {
  visible: boolean;
  member: ConversationMember | null;
  meta: ConversationMeta | null | undefined;
  saving?: boolean;
  onClose: () => void;
  onSave: (permissions: Record<ChatPermissionKey, boolean>) => void;
}

export function MemberPermissionsModal({
  visible,
  member,
  meta,
  saving = false,
  onClose,
  onSave,
}: MemberPermissionsModalProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [draft, setDraft] = useState<Record<ChatPermissionKey, boolean> | null>(null);

  useEffect(() => {
    if (visible && member) {
      setDraft(initialPerms(member, meta));
    }
    if (!visible) {
      setDraft(null);
    }
  }, [visible, member, meta]);

  if (!member || !draft) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.backdrop} />
      </Modal>
    );
  }

  const name =
    `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim() ||
    member.name ||
    `Участник ${member.member_id}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Права участника</Text>
            <Pressable onPress={onClose} hitSlop={10} disabled={saving}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text style={styles.subtitle}>{name}</Text>
          <Text style={styles.hint}>
            Личные ограничения поверх настроек чата. Владелец и админы по роли сохраняют полные
            возможности.
          </Text>

          <View style={styles.list}>
            {ROWS.map((row, index) => (
              <View
                key={row.key}
                style={[styles.row, index < ROWS.length - 1 && styles.rowBorder]}
              >
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Switch
                  value={draft[row.key]}
                  onValueChange={(value) =>
                    setDraft((prev) => (prev ? { ...prev, [row.key]: value } : prev))
                  }
                  disabled={saving}
                  trackColor={{ false: colors.textMuted, true: colors.primary }}
                  thumbColor="#fff"
                />
              </View>
            ))}
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
            >
              <Text style={styles.btnSecondary}>Отмена</Text>
            </Pressable>
            <Pressable
              onPress={() => onSave(draft)}
              disabled={saving}
              style={({ pressed }) => [
                styles.btn,
                styles.btnPrimary,
                pressed && styles.pressed,
              ]}
            >
              {saving ? (
                <ActivityIndicator color={colors.textOnPrimary} />
              ) : (
                <Text style={styles.btnPrimaryText}>Сохранить</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(28,25,23,0.08)';
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: 20,
    },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      padding: 18,
      gap: 10,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      marginTop: -4,
    },
    hint: {
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 16,
    },
    list: {
      marginTop: 4,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: colors.surface,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    rowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: border,
    },
    rowLabel: {
      flex: 1,
      fontSize: 15,
      fontWeight: '500',
      color: colors.text,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 6,
    },
    btn: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      minWidth: 96,
      alignItems: 'center',
    },
    btnPrimary: {
      backgroundColor: colors.primary,
    },
    btnSecondary: {
      color: colors.textSecondary,
      fontWeight: '600',
    },
    btnPrimaryText: {
      color: colors.textOnPrimary,
      fontWeight: '700',
    },
    pressed: {
      opacity: 0.75,
    },
  });
}
