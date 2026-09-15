import { Ionicons } from '@expo/vector-icons';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { joinByInviteToken, previewInviteJoin } from '../api/messenger';
import { ChatAvatar } from '../components/messenger/ChatAvatar';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import type { RootStackParamList } from '../navigation/types';
import { useTheme, type ThemeColors } from '../theme';

type Route = RouteProp<RootStackParamList, 'JoinInvite'>;

export function JoinInviteScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const qc = useQueryClient();
  const token = route.params.token?.trim() ?? '';

  const previewQuery = useQuery({
    queryKey: ['messenger', 'join-preview', token],
    queryFn: () => previewInviteJoin(token),
    enabled: token.length >= 4,
    retry: false,
  });

  const joinMut = useMutation({
    mutationFn: () => joinByInviteToken(token),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ['messenger', 'conversations'] });
      await qc.invalidateQueries({ queryKey: ['messenger', 'unread'] });
      navigation.replace('ChatThread', {
        conversationId: res.conversationId,
        title: res.title ?? res.conversation?.title ?? 'Чат',
        isGroup: res.type !== 'private',
      });
    },
  });

  if (!token || token.length < 4) {
    return (
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        <ErrorView
          message="Некорректная ссылка-приглашение"
          onRetry={() => navigation.goBack()}
        />
      </View>
    );
  }

  if (previewQuery.isLoading) {
    return (
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        <LoadingView />
      </View>
    );
  }

  if (previewQuery.isError || !previewQuery.data) {
    return (
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        <ErrorView
          message={
            previewQuery.error instanceof Error
              ? previewQuery.error.message
              : 'Ссылка недействительна или устарела'
          }
          onRetry={() => void previewQuery.refetch()}
        />
        <Pressable onPress={() => navigation.goBack()} style={styles.secondaryBtn}>
          <Text style={styles.secondaryText}>Закрыть</Text>
        </Pressable>
      </View>
    );
  }

  const preview = previewQuery.data;
  const title = preview.title?.trim() || (preview.type === 'channel' ? 'Канал' : 'Группа');
  const typeLabel = preview.type === 'channel' ? 'Канал' : 'Группа';

  return (
    <View style={[styles.safe, { paddingTop: insets.top || 12, paddingBottom: insets.bottom || 16 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Приглашение</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.body}>
        <ChatAvatar
          name={title}
          imageUrl={preview.avatar_url}
          size={72}
        />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>{typeLabel}</Text>

        {preview.alreadyMember ? (
          <Text style={styles.hint}>Вы уже участник этого чата</Text>
        ) : (
          <Text style={styles.hint}>Вас пригласили в этот чат</Text>
        )}

        {joinMut.isError ? (
          <Text style={styles.error}>
            {joinMut.error instanceof Error
              ? joinMut.error.message
              : 'Не удалось вступить'}
          </Text>
        ) : null}

        <Pressable
          onPress={() => joinMut.mutate()}
          disabled={joinMut.isPending}
          style={({ pressed }) => [
            styles.primaryBtn,
            joinMut.isPending && { opacity: 0.6 },
            pressed && { opacity: 0.9 },
          ]}
        >
          {joinMut.isPending ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.primaryText}>
              {preview.alreadyMember ? 'Открыть чат' : 'Вступить'}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  const border = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.1)';
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: border,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    body: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      gap: 10,
    },
    title: {
      marginTop: 12,
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
    },
    meta: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    hint: {
      marginTop: 8,
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
    },
    error: {
      marginTop: 8,
      color: '#b91c1c',
      textAlign: 'center',
    },
    primaryBtn: {
      marginTop: 20,
      minWidth: 200,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 24,
      alignItems: 'center',
    },
    primaryText: {
      color: colors.textOnPrimary,
      fontWeight: '800',
      fontSize: 15,
    },
    secondaryBtn: {
      alignSelf: 'center',
      marginTop: 16,
      padding: 12,
    },
    secondaryText: {
      color: colors.primary,
      fontWeight: '600',
    },
  });
}
