import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Image } from 'expo-image';
import { useMemo } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  fetchProfileByMemberId,
  fetchProfileByUsername,
  profileDisplayName,
} from '../api/profile';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { ScreenHeader } from '../components/ScreenHeader';
import { resolvePublicUrl } from '../lib/resolvePublicUrl';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../stores/authStore';
import { useTheme, type ThemeColors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ProfileScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const route = useRoute<Props['route']>();
  const myUsername = useAuthStore((s) => s.username);
  const myMemberId = useAuthStore((s) => s.memberId);

  const username = route.params?.username?.trim() || undefined;
  const memberId = route.params?.memberId;
  const isSelf =
    (!username && memberId == null) ||
    (username != null && username === myUsername) ||
    (memberId != null && memberId === myMemberId);

  const profileQuery = useQuery({
    queryKey: ['profile', username ?? memberId ?? 'me', myUsername, myMemberId],
    queryFn: async () => {
      if (username) return fetchProfileByUsername(username);
      if (memberId != null) return fetchProfileByMemberId(memberId);
      if (myUsername) return fetchProfileByUsername(myUsername);
      if (myMemberId != null) return fetchProfileByMemberId(myMemberId);
      throw new Error('Профиль недоступен');
    },
  });

  if (profileQuery.isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Профиль" />
        <LoadingView />
      </SafeAreaView>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Профиль" />
        <ErrorView
          message={String(profileQuery.error ?? 'Не найдено')}
          onRetry={() => void profileQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  const { profile, posts } = profileQuery.data;
  const name = profileDisplayName(profile);
  const avatarUrl = resolvePublicUrl(profile.avatar_url);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader
        title={isSelf ? 'Мой профиль' : name}
        subtitle={profile.username ? `@${profile.username}` : undefined}
      />
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={profileQuery.isFetching}
            onRefresh={() => void profileQuery.refetch()}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.avatarRow}>
              <View style={styles.avatar}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImg} contentFit="cover" />
                ) : (
                  <Text style={styles.avatarText}>{(name[0] ?? '?').toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{name}</Text>
                {profile.username ? (
                  <Text style={styles.username}>@{profile.username}</Text>
                ) : null}
                <Text style={styles.meta}>{posts.length} публикаций</Text>
              </View>
            </View>
            {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
            {isSelf ? (
              <Pressable
                onPress={() => navigation.navigate('ProfileEdit')}
                style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.9 }]}
              >
                <Ionicons name="create-outline" size={18} color={colors.textOnPrimary} />
                <Text style={styles.editBtnText}>Редактировать</Text>
              </Pressable>
            ) : null}
            <Text style={styles.section}>Публикации</Text>
          </View>
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="images-outline" size={36} color={colors.textMuted} />
            <Text style={styles.emptyText}>Пока нет публикаций</Text>
          </View>
        }
        renderItem={({ item }) => {
          const mediaUrl = resolvePublicUrl(item.media[0]?.url);
          return (
            <Pressable
              onPress={() => navigation.navigate('FeedPostComments', { postId: item.id })}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
            >
              {mediaUrl ? (
                <Image source={{ uri: mediaUrl }} style={styles.media} contentFit="cover" />
              ) : null}
              {item.caption ? <Text style={styles.caption}>{item.caption}</Text> : null}
              <Text style={styles.cardMeta}>
                {format(parseISO(item.created_at), 'd MMM yyyy', { locale: ru })} · ♥{' '}
                {item.like_count} · 💬 {item.comment_count}
              </Text>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    list: { paddingBottom: 40 },
    headerBlock: { padding: 16, paddingBottom: 8 },
    avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarImg: { width: 72, height: 72 },
    avatarText: { color: colors.textOnPrimary, fontSize: 28, fontWeight: '800' },
    name: { fontSize: 20, fontWeight: '800', color: colors.text },
    username: { fontSize: 14, color: colors.primary, marginTop: 2, fontWeight: '600' },
    meta: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
    bio: { fontSize: 15, color: colors.textSecondary, marginTop: 14, lineHeight: 22 },
    editBtn: {
      marginTop: 14,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
    },
    editBtnText: { color: colors.textOnPrimary, fontWeight: '700' },
    section: {
      marginTop: 20,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      color: colors.textMuted,
    },
    card: {
      marginHorizontal: 16,
      marginBottom: 12,
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.06)',
    },
    media: { width: '100%', height: 200, backgroundColor: colors.surface },
    caption: { padding: 14, paddingBottom: 0, fontSize: 15, color: colors.text, lineHeight: 22 },
    cardMeta: { padding: 14, fontSize: 12, color: colors.textMuted },
    empty: { alignItems: 'center', paddingTop: 40, gap: 8 },
    emptyText: { color: colors.textMuted, fontWeight: '600' },
  });
}
