import { Ionicons } from '@expo/vector-icons';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View, Pressable } from 'react-native';

import { formatApiError } from '../api/client';
import { fetchChatMeta, patchChatPermissions, type PermissionKey } from '../api/chatManage';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { PERMISSION_ROWS, canManageGroup, isAppAdmin, withPermissionDefaults } from '../lib/chatManage';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../stores/authStore';
import { useTheme, type ThemeColors } from '../theme';

const ICONS: Record<PermissionKey, keyof typeof Ionicons.glyphMap> = {
  can_send_messages: 'chatbubble-outline',
  can_send_media: 'image-outline',
  can_add_users: 'person-add-outline',
  can_pin_messages: 'pin-outline',
  can_manage_chat: 'shield-outline',
};

/** Разрешения участников группы по умолчанию (кроме владельца и админов). */
export function ChatPermissionsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { conversationId } = useRoute<RouteProp<RootStackParamList, 'ChatPermissions'>>().params;
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles);
  const [draft, setDraft] = useState<Record<PermissionKey, boolean> | null>(null);

  const meta = useQuery({
    queryKey: ['messenger', 'meta', conversationId],
    queryFn: () => fetchChatMeta(conversationId),
  });

  useEffect(() => {
    if (meta.data) setDraft(withPermissionDefaults(meta.data.default_permissions));
  }, [meta.data]);

  const canEdit = canManageGroup(meta.data?.my_effective_permissions, isAppAdmin(role, roles));
  const dirty =
    draft != null &&
    meta.data != null &&
    PERMISSION_ROWS.some((r) => draft[r.key] !== withPermissionDefaults(meta.data!.default_permissions)[r.key]);

  const save = useMutation({
    mutationFn: () => patchChatPermissions(conversationId, { default_permissions: draft ?? {} }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['messenger', 'meta', conversationId] });
    },
  });

  if (meta.isPending) return <LoadingView />;
  if (meta.isError || !draft) {
    return <ErrorView message={formatApiError(meta.error)} onRetry={() => void meta.refetch()} />;
  }

  return (
    <View style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lead}>По умолчанию для участников (кроме владельца и админов).</Text>
        {!canEdit ? (
          <Text style={styles.notice}>
            Менять разрешения могут администраторы приложения и участники с правом «Управление чатом».
          </Text>
        ) : null}
        <View style={styles.group}>
          {PERMISSION_ROWS.map((row, i) => (
            <View key={row.key} style={[styles.row, i > 0 && styles.rowDivider]}>
              <View style={styles.icon}>
                <Ionicons name={ICONS[row.key]} size={22} color={colors.primary} />
              </View>
              <View style={styles.texts}>
                <Text style={styles.rowTitle}>{row.title}</Text>
                <Text style={styles.rowDesc}>{row.description}</Text>
              </View>
              <Switch
                value={draft[row.key]}
                disabled={!canEdit || save.isPending}
                onValueChange={(v) => setDraft((d) => (d ? { ...d, [row.key]: v } : d))}
                accessibilityLabel={row.title}
              />
            </View>
          ))}
        </View>
        {save.isError ? (
          <Text style={styles.error}>Не удалось сохранить: {formatApiError(save.error)}</Text>
        ) : null}
        {save.isSuccess && !dirty ? <Text style={styles.ok}>Разрешения сохранены.</Text> : null}
      </ScrollView>
      {canEdit ? (
        <View style={styles.footer}>
          <Pressable
            onPress={() => save.mutate()}
            disabled={!dirty || save.isPending}
            accessibilityRole="button"
            style={[styles.saveBtn, (!dirty || save.isPending) && { opacity: 0.5 }]}
          >
            {save.isPending ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.saveText}>Сохранить</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    content: { padding: 16, gap: 12 },
    lead: { fontSize: 16, lineHeight: 24, color: colors.textSecondary },
    notice: {
      fontSize: 15,
      lineHeight: 22,
      color: '#78350F',
      backgroundColor: '#FEF3C7',
      padding: 12,
      borderRadius: 12,
      overflow: 'hidden',
    },
    group: { borderRadius: colors.radius, backgroundColor: colors.surfaceElevated, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 72 },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.textMuted + '55' },
    icon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: colors.primary + '17',
      alignItems: 'center',
      justifyContent: 'center',
    },
    texts: { flex: 1, minWidth: 0 },
    rowTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    rowDesc: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: 2 },
    error: { fontSize: 15, color: '#B42318' },
    ok: { fontSize: 15, color: '#15803D' },
    footer: { padding: 16 },
    saveBtn: {
      minHeight: 54,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveText: { fontSize: 17, fontWeight: '800', color: colors.textOnPrimary },
  });
}
